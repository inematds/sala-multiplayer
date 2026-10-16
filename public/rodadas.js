// Agrupa os eventos da sala em rodadas (uma por mensagem de pessoa) e monta a faixa de resolução.
// Sem DOM: roda no navegador (Fluxo visual, tópicos) e nos testes do Node.
// Eventos da v0.5 em diante têm `rodada` e `pai`; os antigos são agrupados pela hora (aprox: true).

const ATIVIDADE = new Set(['resposta', 'ferramenta', 'resultado', 'rascunho', 'proposta', 'sistema']);
const COM_APROVACAO = new Set(['proposta', 'rascunho', 'pedido']);

export function rodadas(eventos) {
  const grupos = new Map(), porAprov = new Map();
  let atual = null; // grupo aproximado aberto (só para eventos antigos)
  const abrir = (chave, inicio, aprox) => {
    const g = { chave, inicio, eventos: [], aprox, ramo: new Map(), nRamos: 0 };
    grupos.set(chave, g);
    return g;
  };
  const por = new Map(eventos.map((e) => [e.id, e]));
  for (const e of eventos) {
    let g = null;
    if (e.rodada != null) {
      atual = null;
      const chave = String(e.rodada);
      g = grupos.get(chave) || abrir(chave, por.get(e.rodada) || e, false);
    } else if (e.tipo === 'aprovacao' && e.meta?.aprovacao != null) {
      g = porAprov.get(e.meta.aprovacao) || null;
    } else if (e.tipo === 'mensagem') {
      g = atual = abrir(`a${e.id}`, e, true);
    } else if (atual && ATIVIDADE.has(e.tipo)) {
      g = atual;
    }
    if (!g) continue;
    g.eventos.push(e);
    if (COM_APROVACAO.has(e.tipo) && e.meta?.aprovacao != null) porAprov.set(e.meta.aprovacao, g);
  }
  for (const g of grupos.values()) marcarRamos(g, por);
  return [...grupos.values()];
}

// Ramo = cada agente que a mensagem humana acionou direto; o que vem depois dele herda o ramo pelo `pai`.
function marcarRamos(g, por) {
  if (g.aprox) return;
  const raiz = g.inicio.id, raizes = [];
  const subir = (e) => {
    let x = e, voltas = 0;
    while (x && x.pai != null && x.pai !== raiz && voltas++ < 50) x = por.get(x.pai);
    return x && x.pai === raiz ? x : null;
  };
  let soltos = [];
  for (const e of g.eventos) {
    if (e.id === raiz) continue;
    const topo = subir(e);
    // Ferramenta e resultado do primeiro agente apontam para a mensagem; o ramo vem da resposta que sai depois.
    if (topo && topo.tipo !== 'resposta' && topo.tipo !== 'rascunho' && topo.id === e.id) { soltos.push(e); continue; }
    if (!topo) continue;
    if (!raizes.includes(topo.id)) raizes.push(topo.id);
    const n = raizes.indexOf(topo.id);
    g.ramo.set(e.id, n);
    for (const s of soltos) g.ramo.set(s.id, n);
    soltos = [];
  }
  g.nRamos = raizes.length;
}

const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const curto = (t, n = 110) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// estado = { participantes, pendentes } (o mesmo de /api/estado).
export function resolucao(r, estado) {
  const agentes = new Set((estado.participantes || []).filter((p) => p.tipo === 'agente').map((p) => p.id));
  const pend = new Map((estado.pendentes || []).map((a) => [a.id, a]));
  const respostas = r.eventos.filter((e) => (e.tipo === 'resposta' || e.tipo === 'rascunho') && agentes.has(e.de));
  const propostas = r.eventos.filter((e) => COM_APROVACAO.has(e.tipo) && e.meta?.aprovacao != null).map((e) => {
    const id = e.meta.aprovacao;
    const dec = r.eventos.find((x) => x.tipo === 'aprovacao' && x.meta?.aprovacao === id);
    const estadoP = pend.has(id) ? 'pendente' : dec ? (/^recusou/.test(dec.texto) ? 'recusada' : 'aprovada') : 'decidida';
    return { id, texto: curto(e.texto), estado: estadoP, quem: dec?.de || null, hora: dec?.hora || null };
  });
  return {
    respostas: respostas.length,
    ecos: respostas.filter((e) => e.meta?.eco).length,
    ms: respostas.reduce((s, e) => s + (e.meta?.ms || 0), 0),
    agentes: [...new Set(respostas.map((e) => e.de))],
    propostas,
    decidido: propostas.filter((p) => p.estado === 'aprovada' || p.estado === 'recusada').map((p) => `#${p.id} ${p.estado}${p.hora ? ` às ${hhmm(p.hora)}` : ''}: ${p.texto}`),
    pendentes: propostas.filter((p) => p.estado === 'pendente').map((p) => `#${p.id} esperando decisão: ${p.texto}`),
    tetos: r.eventos.filter((e) => e.tipo === 'sistema' && /^Teto/.test(e.texto)).map((e) => e.texto),
    falhas: r.eventos.filter((e) => e.tipo === 'sistema' && /falhou/.test(e.texto)).map((e) => curto(e.texto, 160)),
  };
}
