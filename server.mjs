// sala-multiplayer — servidor do painel. Sem dependências: Node 24 (node:sqlite, fetch, SSE).
// Uso: node server.mjs --perfil pessoa|atendimento [--porta 4600] [--falso] [--demo]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from './lib/banco.mjs';
import { criarSala } from './lib/sala.mjs';
import { criarTelegram } from './lib/telegram.mjs';
import { claude, codex, falso } from './lib/agentes.mjs';
import { lerModelos, lerNiveis } from './lib/modelos.mjs';
import { CAMPOS_SALA, CAMPOS_AGENTE, senhaConfere } from './lib/config.mjs';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[i + 1]); };

// .env simples (fora do git): SALA_TELEGRAM_TOKEN, SALA_DONO_TELEGRAM_ID etc.
const envArq = path.join(RAIZ, '.env');
if (fs.existsSync(envArq)) {
  for (const l of fs.readFileSync(envArq, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const perfilId = arg('perfil', process.env.SALA_PERFIL || 'pessoa');
const perfil = JSON.parse(fs.readFileSync(path.join(RAIZ, 'perfis', `${perfilId}.json`), 'utf8'));
const porta = Number(arg('porta', process.env.SALA_PORTA || 4600));
const host = process.env.SALA_HOST || '127.0.0.1';
const usarFalso = arg('falso', false) === true || process.env.SALA_AGENTES === 'falso' || arg('demo', false) === true;
// O demo usa pasta própria e começa limpo a cada início: não mistura com a sala de verdade nem repete a conversa.
const ehDemo = arg('demo', false) === true;
const dados = path.join(RAIZ, 'data', ehDemo ? `demo-${perfilId}` : perfilId);
if (ehDemo) fs.rmSync(dados, { recursive: true, force: true });
const banco = abrirBanco(path.join(dados, 'sala.db'));
const modelos = lerModelos();
const niveis = lerNiveis();

async function motor(ctx) {
  if (usarFalso) return falso(ctx);
  const m = niveis[ctx.agente.nivel || 'executor']?.[ctx.agente.motor] || modelos[ctx.agente.motor] || {};
  const fn = ctx.agente.motor === 'codex' ? codex : claude;
  return fn({ sistema: ctx.sistema, prompt: ctx.prompt, modelo: m.modelo, esforco: ctx.agente.esforco || m.esforco });
}

let tg = null;
const externo = async (conversa, texto) => {
  if (tg && !conversa.startsWith('tg:demo')) await tg.enviar(conversa, texto).catch((e) => console.log(`[telegram] envio falhou: ${e.message}`));
};
externo.avisar = async (tid, texto) => { if (tg && tid) await tg.avisar(tid, texto).catch(() => {}); };
externo.avisarAprovadores = async (a, agente) => {
  if (!tg) return;
  // Pedido de entrada de convidado: só o dono decide.
  if (a.tipo === 'convite') {
    const d = banco.participantes().find((p) => p.id === perfil.dono);
    if (d?.telegram_id) await tg.avisar(d.telegram_id, `Pedido #${a.id}: ${a.texto}\n\n/aceitar ${a.id}   ou   /recusar ${a.id}`).catch(() => {});
    return;
  }
  const oque = a.tipo === 'agente' ? `${agente.nome} propõe um agente novo` : `${agente.nome} quer responder`;
  for (const p of banco.participantes()) {
    if (p.tipo === 'pessoa' && p.telegram_id && (perfil.aprovadores || []).includes(p.papel)) {
      await tg.avisar(p.telegram_id, `Aprovação #${a.id} — ${oque}:\n\n${a.texto}\n\n/aprovar ${a.id}   ou   /recusar ${a.id}`).catch(() => {});
    }
  }
};

const sala = criarSala({ perfil, banco, motor, raiz: RAIZ, dados, externo });

if (process.env.SALA_TELEGRAM_TOKEN && !usarFalso) {
  tg = criarTelegram({
    token: process.env.SALA_TELEGRAM_TOKEN, banco, perfil,
    aoReceber: (m) => sala.receber(m),
    // /entrar sem id: vira pedido para o dono. Devolve o texto que a pessoa recebe.
    async aoEntrada(u) {
      const r = await sala.pedirEntrada(u);
      if (r.ja) return `Você já está na sala como ${r.ja.nome}. É só escrever aqui.`;
      if (r.bloqueado) return 'Este Telegram é de alguém da equipe e está desligado. Fale com o dono.';
      if (r.repetido) return `Seu pedido #${r.repetido.id} já está com o dono. Aguarde.`;
      if (r.voltou) return '';
      return `Pedido #${r.pedido.id} enviado ao dono da sala "${perfil.nome}". Você recebe aviso aqui quando ele decidir.`;
    },
    // Alguém de fora mandou ping: o dono recebe o id e o comando pronto.
    async aoPing(u) {
      const d = banco.participantes().find((p) => p.id === sala.dono);
      if (!d?.telegram_id) return;
      const livres = (perfil.pessoas || []).filter((p) => !banco.participantes().find((x) => x.id === p.id)?.telegram_id).map((p) => p.id);
      const nome = [u.first_name, u.last_name].filter(Boolean).join(' ') + (u.username ? ` @${u.username}` : '');
      await tg.avisar(d.telegram_id, `${nome} mandou ping ao bot. id ${u.id}.` + (livres.length ? `\nPara colocar na sala: /entrar ${u.id} ${livres[0]}${livres.length > 1 ? `  (pessoas sem Telegram: ${livres.join(', ')})` : ''}` : '\nTodas as pessoas do perfil já têm Telegram.')).catch(() => {});
    },
    async aoComando({ quem, acao, id, conversa, args, tid, pessoa, alvo }) {
      if (acao === 'sair') {
        try { await sala.sair(quem.id); await tg.enviar(conversa, 'Você saiu da sala. Para voltar: /entrar.'); }
        catch (e) { await tg.enviar(conversa, `Não saí: ${e.message}.`); }
        return;
      }
      if (acao === 'remover') {
        try { const p = await sala.remover(alvo, quem.id); await tg.enviar(conversa, `Feito: ${p.nome} desligado da sala.`); }
        catch (e) { await tg.enviar(conversa, `Não removi: ${e.message}.`); }
        return;
      }
      if (acao === 'entrar') {
        if (quem.id !== sala.dono) return tg.enviar(conversa, 'Só o dono coloca pessoas na sala.');
        try { const p = sala.ligarTelegram(pessoa, tid, quem.id); await tg.enviar(conversa, `Feito: ${p.nome} está na sala (id ${tid}).`); await tg.avisar(tid, `Você entrou na sala "${perfil.nome}" como ${p.nome}. É só escrever aqui.`).catch(() => {}); }
        catch (e) { await tg.enviar(conversa, `Não coloquei: ${e.message}`); }
        return;
      }
      if (acao === 'config') {
        // Só o dono, reconhecido pelo id do Telegram. "/config" mostra; "/config campo valor" muda.
        if (quem.id !== sala.dono) return tg.enviar(conversa, 'Só o dono da sala mexe na configuração. Peça a mudança no chat: o agente monta a proposta e o dono aprova.');
        if (!args) {
          const c = sala.config();
          return tg.enviar(conversa, [`Configuração (${perfil.nome})`, `teto_turnos ${c.teto_turnos}`, `teto_rodada ${c.teto_rodada}`, `teto_diario ${c.teto_diario}`, `linhas_max ${c.linhas_max}`,
            `teto_convidado ${c.teto_convidado}`, `convidado_reaprovar ${c.convidado_reaprovar}`, `convidado_expira_h ${c.convidado_expira_h} (0 = nunca)`,
            ...c.agentes.map((a) => `@${a.id}: nivel ${a.nivel}, esforco ${a.esforco || '(do nível)'}, linhas_max ${a.linhas_max ?? '(padrão)'}, teto_diario ${a.teto_diario ?? '(sala)'}`),
            'Mudar: /config teto_turnos 20  ou  /config agente.claude.nivel super'].join('\n'));
        }
        const [campo, ...resto] = args.split(/\s+/);
        try { sala.mudarConfig({ [campo]: resto.join(' ').replace(/^(vazio|padrao|padrão)$/i, '') }, quem.id, conversa); await tg.enviar(conversa, `Feito: ${campo} = ${resto.join(' ') || '(padrão)'}.`); }
        catch (e) { await tg.enviar(conversa, `Não mudei: ${e.message}`); }
        return;
      }
      if (!(perfil.aprovadores || []).includes(quem.papel) && quem.id !== sala.dono) return;
      let r;
      try { r = acao === 'aprovar' ? await sala.aprovar(id, quem.id) : await sala.recusar(id, quem.id); }
      catch (e) { return tg.enviar(conversa, `#${id}: ${e.message}.`); }
      const feito = acao === 'recusar' ? 'recusada' : r?.tipo === 'agente' ? `aprovada: agente @${r.dados.agente.id} criado` : r?.tipo === 'config' ? 'aprovada: configuração mudada'
        : r?.tipo === 'convite' ? `aceito: ${r.participante.nome} entrou como convidado (tirar: /remover ${r.participante.id})` : 'aprovada e enviada';
      await tg.enviar(conversa, r ? `#${id} ${feito}.` : `#${id} não está pendente.`);
    },
  });
  tg.iniciar();
} else {
  console.log(`[telegram] desligado (${usarFalso ? 'modo falso' : 'sem SALA_TELEGRAM_TOKEN no .env'})`);
}

// ---------- HTTP ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const PAGINAS = { '/': 'sala.html', '/sala': 'sala.html', '/grafo': 'grafo.html', '/fluxo': 'fluxo.html', '/config': 'config.html' };

const json = (res, obj, code = 200) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const corpo = (req) => new Promise((ok, falha) => {
  let s = ''; req.on('data', (d) => { s += d; if (s.length > 1e5) req.destroy(); });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { falha(e); } });
});
const daEquipe = (id) => (perfil.pessoas || []).some((p) => p.id === id);

function estado() {
  return {
    perfil: { id: perfil.id, nome: perfil.nome, descricao: perfil.descricao, equipe: perfil.pessoas, teto_diario: perfil.teto_diario ?? 200, teto_turnos: perfil.teto_turnos ?? 4 },
    modo: usarFalso ? 'falso' : 'real', telegram: Boolean(tg),
    participantes: banco.participantes(), eventos: banco.eventos(400), pendentes: banco.pendentes(),
    stats: banco.stats(), ativos: [...sala.ativos], contas: banco.contas(),
    agentes: Object.values(sala.agentes).map((a) => ({ id: a.id, motor: a.motor, nivel: a.nivel || 'executor', esforco: a.esforco || '', linhas_max: a.linhas_max || perfil.linhas_max || 6, teto_diario: a.teto_diario || null, ferramentas: a.ferramentas || [] })),
    niveis, config: sala.config(),
    topicos: banco.topicos(60), agente_topicos: sala.agentes[perfil.agente_topicos || 'topicos'] ? (perfil.agente_topicos || 'topicos') : null,
  };
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/api/estado') return json(res, estado());
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const manda = (tipo) => (d) => {
        res.write(`event: ${tipo}\ndata: ${JSON.stringify(d)}\n\n`);
        if (tipo !== 'stats') res.write(`event: stats\ndata: ${JSON.stringify(banco.stats())}\n\n`);
      };
      const ouvintes = ['evento', 'participante', 'aprovacao', 'ativos', 'config', 'topico'].map((t) => [t, manda(t)]);
      for (const [t, f] of ouvintes) banco.bus.on(t, f);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); for (const [t, f] of ouvintes) banco.bus.off(t, f); });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/mensagem') {
      const b = await corpo(req);
      if (!daEquipe(b.de) || !b.texto?.trim()) return json(res, { erro: 'remetente ou texto inválido' }, 400);
      sala.receber({ de: b.de, conversa: b.conversa || 'painel', texto: b.texto.trim() }).catch((e) => console.log(e));
      return json(res, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return json(res, { ...sala.config(), campos_sala: CAMPOS_SALA, campos_agente: CAMPOS_AGENTE, niveis, senha_definida: Boolean(process.env.SALA_DONO_SENHA) });
    }
    if (req.method === 'POST' && url.pathname === '/api/config') {
      const b = await corpo(req);
      if (!senhaConfere(b.senha)) return json(res, { erro: 'senha do dono errada (ou SALA_DONO_SENHA vazia no .env)' }, 403);
      try { return json(res, { ok: true, mudou: sala.mudarConfig(b.mudancas, sala.dono) }); }
      catch (e) { return json(res, { erro: e.message }, 400); }
    }
    // Dono liga ou desliga um convidado pelo painel (com a senha).
    if (req.method === 'POST' && url.pathname === '/api/convidado') {
      const b = await corpo(req);
      if (!senhaConfere(b.senha)) return json(res, { erro: 'só o dono liga ou desliga convidado, com a senha' }, 403);
      try { return json(res, { ok: true, participante: await sala.ligarConvidado(String(b.id), Boolean(b.ativo), sala.dono) }); }
      catch (e) { return json(res, { erro: e.message }, 400); }
    }
    if (req.method === 'POST' && (url.pathname === '/api/aprovar' || url.pathname === '/api/recusar')) {
      const b = await corpo(req);
      const quem = (perfil.pessoas || []).find((p) => p.id === b.de);
      // Mudança de configuração e convidado: só o dono, com a senha (o "Você é" do painel não prova quem é).
      const tipoAp = banco.aprovacao(Number(b.id))?.tipo;
      if (tipoAp === 'config' || tipoAp === 'convite') {
        if (!senhaConfere(b.senha)) return json(res, { erro: `${tipoAp === 'config' ? 'mudança de configuração' : 'convidado'}: só o dono decide, com a senha` }, 403);
        b.de = sala.dono;
      } else if (!quem || !(perfil.aprovadores || []).includes(quem.papel)) return json(res, { erro: 'sem permissão para aprovar' }, 403);
      let r;
      try { r = url.pathname === '/api/aprovar' ? await sala.aprovar(Number(b.id), b.de, b.texto, b.ajustes) : await sala.recusar(Number(b.id), b.de); }
      catch (e) { return json(res, { erro: e.message }, 400); }
      return json(res, r ? { ok: true } : { erro: 'não está pendente' }, r ? 200 : 409);
    }
    const pag = PAGINAS[url.pathname];
    const arq = path.join(RAIZ, 'public', pag || url.pathname.replace(/^\/+/, ''));
    if (req.method === 'GET' && arq.startsWith(path.join(RAIZ, 'public')) && fs.existsSync(arq) && fs.statSync(arq).isFile()) {
      res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
      return fs.createReadStream(arq).pipe(res);
    }
    json(res, { erro: 'não encontrado' }, 404);
  } catch (e) {
    json(res, { erro: e.message }, 500);
  }
});

servidor.listen(porta, host, () => {
  console.log(`[sala] perfil "${perfil.nome}" em http://${host}:${porta}  (agentes: ${usarFalso ? 'falsos' : `claude ${modelos.claude.modelo || 'padrão'}, codex ${modelos.codex.modelo || 'padrão'}`})`);
  if (ehDemo) demo();
});

// Conversa de demonstração (motor falso, sem Telegram): serve para ver o grafo e o fluxo andando.
async function demo() {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const eu = perfil.pessoas[0].id;
  if (perfil.id === 'atendimento') {
    banco.participante({ id: 'tg-demo1', nome: 'Maria (cliente)', tipo: 'pessoa', papel: 'cliente', origem: 'telegram', telegram_id: 'demo1' });
    banco.participante({ id: 'tg-demo2', nome: 'João (cliente)', tipo: 'pessoa', papel: 'cliente', origem: 'telegram', telegram_id: 'demo2' });
    await sala.receber({ de: 'tg-demo1', conversa: 'tg:demo1', texto: 'Qual o prazo de entrega para o interior?' }); await espera(900);
    await sala.receber({ de: 'tg-demo2', conversa: 'tg:demo2', texto: 'Quero trocar um produto que veio com defeito' }); await espera(900);
    await sala.receber({ de: 'atendente', conversa: 'painel', texto: '@codex confere a resposta do prazo para a Maria, sem ferramenta' }); await espera(900);
    const p = banco.pendentes()[0];
    if (p) await sala.aprovar(p.id, 'supervisor');
    await espera(900);
    await sala.receber({ de: 'supervisor', conversa: 'painel', texto: '@claude cria agente cobranca para lembrar clientes de boletos, sem ferramenta' });
  } else {
    await sala.receber({ de: eu, conversa: 'painel', texto: 'guarda: ligar para o contador na sexta' }); await espera(900);
    await sala.receber({ de: eu, conversa: 'painel', texto: '@codex como listo arquivos maiores que 1 GB? sem ferramenta' }); await espera(900);
    await sala.receber({ de: eu, conversa: 'painel', texto: '@claude eco-laco @codex' }); await espera(900);
    await sala.receber({ de: eu, conversa: 'painel', texto: '@claude so-confirma codex' }); await espera(900);
    // Convidados do Telegram: um aceito e conversando, outro esperando o dono.
    const bia = await sala.pedirEntrada({ tid: 'demo-bia', nome: 'Bia (convidada)', usuario: 'bia' });
    if (bia.pedido) await sala.aprovar(bia.pedido.id, sala.dono);
    await sala.receber({ de: 'tg-demo-bia', conversa: 'tg:demo-bia', texto: 'oi, posso ver as notas? sem ferramenta', via: 'telegram' }); await espera(900);
    await sala.pedirEntrada({ tid: 'demo-ana', nome: 'Ana', usuario: 'ana' }); await espera(900);
    // Organizador de tópicos aprovado: a partir daqui os tópicos têm resumo escrito.
    if (!sala.agentes.topicos) {
      await sala.receber({ de: eu, conversa: 'painel', texto: 'cria agente topicos, sem ferramenta' });
      const pt = banco.pendentes().find((a) => a.tipo === 'agente');
      if (pt) await sala.aprovar(pt.id, sala.dono);
    }
    await sala.receber({ de: eu, conversa: 'painel', texto: '@codex, painel de tópicos clicável na sala? sem ferramenta' }); await espera(900);
    await sala.receber({ de: eu, conversa: 'painel', texto: '@claude mesmo assunto: e o resumo no alto do chat? sem ferramenta' });
  }
}
