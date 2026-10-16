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
import { lerModelos } from './lib/modelos.mjs';

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
const dados = path.join(RAIZ, 'data', perfilId);
const banco = abrirBanco(path.join(dados, 'sala.db'));
const modelos = lerModelos();

async function motor(ctx) {
  if (usarFalso) return falso(ctx);
  const m = modelos[ctx.agente.motor] || {};
  const fn = ctx.agente.motor === 'codex' ? codex : claude;
  return fn({ sistema: ctx.sistema, prompt: ctx.prompt, modelo: m.modelo, esforco: m.esforco });
}

let tg = null;
const externo = async (conversa, texto) => {
  if (tg && !conversa.startsWith('tg:demo')) await tg.enviar(conversa, texto).catch((e) => console.log(`[telegram] envio falhou: ${e.message}`));
};
externo.avisarAprovadores = async (a, agente) => {
  if (!tg) return;
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
    async aoComando({ quem, acao, id, conversa }) {
      if (!(perfil.aprovadores || []).includes(quem.papel)) return;
      const r = acao === 'aprovar' ? await sala.aprovar(id, quem.id) : sala.recusar(id, quem.id);
      const feito = acao === 'recusar' ? 'recusada' : r?.tipo === 'agente' ? `aprovada: agente @${r.dados.agente.id} criado` : 'aprovada e enviada';
      await tg.enviar(conversa, r ? `#${id} ${feito}.` : `#${id} não está pendente.`);
    },
  });
  tg.iniciar();
} else {
  console.log(`[telegram] desligado (${usarFalso ? 'modo falso' : 'sem SALA_TELEGRAM_TOKEN no .env'})`);
}

// ---------- HTTP ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const PAGINAS = { '/': 'sala.html', '/sala': 'sala.html', '/grafo': 'grafo.html', '/fluxo': 'fluxo.html' };

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
    agentes: Object.values(sala.agentes).map((a) => ({ id: a.id, motor: a.motor, teto_diario: a.teto_diario || null, ferramentas: a.ferramentas || [] })),
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
      const ouvintes = ['evento', 'participante', 'aprovacao', 'ativos'].map((t) => [t, manda(t)]);
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
    if (req.method === 'POST' && (url.pathname === '/api/aprovar' || url.pathname === '/api/recusar')) {
      const b = await corpo(req);
      const quem = (perfil.pessoas || []).find((p) => p.id === b.de);
      if (!quem || !(perfil.aprovadores || []).includes(quem.papel)) return json(res, { erro: 'sem permissão para aprovar' }, 403);
      const r = url.pathname === '/api/aprovar' ? await sala.aprovar(Number(b.id), b.de, b.texto) : sala.recusar(Number(b.id), b.de);
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
  if (arg('demo', false) === true) demo();
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
    await sala.receber({ de: eu, conversa: 'painel', texto: '@claude eco-laco @codex' });
  }
}
