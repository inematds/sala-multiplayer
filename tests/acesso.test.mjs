// Login pela conta INEMA.PRO: verificador falso (nada sai para a internet), motor falso, Telegram desligado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { criarAcesso, cookiesSessao, cookieVolta } from '../lib/acesso.mjs';
import { abrirBanco } from '../lib/banco.mjs';
import { criarSala } from '../lib/sala.mjs';
import { falso } from '../lib/agentes.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SB = (quem) => `sb-ref-auth-token=base64-${'x'.repeat(30)}-${quem}`;

// Verificador falso: o fim do cookie diz quem é. "semassin" → 403; "renova" devolve cookie novo; sem cookie → 307.
function veredito(cookie = '') {
  const m = cookie.match(/sb-ref-auth-token=base64-x+-(\w+)/);
  if (!m) return { status: 307, headers: { location: '/entrar' } };
  if (m[1] === 'semassin') return { status: 403, body: { ok: false } };
  const headers = m[1] === 'renova' ? { 'set-cookie': 'sb-ref-auth-token=novo; Domain=.inema.pro; Path=/' } : {};
  return { status: 200, headers, body: { ok: true, email: `${m[1]}@x.com` } };
}
function buscarFalso(chamadas) {
  return async (url, op) => {
    chamadas.push(op.headers.cookie);
    const v = veredito(op.headers.cookie);
    return new Response(v.body ? JSON.stringify(v.body) : null, { status: v.status, headers: v.headers });
  };
}

test('cookiesSessao pega só os cookies sb- de sessão', () => {
  assert.deepEqual(cookiesSessao(`tema=x; ${SB('a')}; sb-curto=1; outro=y`), [SB('a')]);
  assert.deepEqual(cookiesSessao(''), []);
});

test('cookieVolta vale em todo .inema.pro e é Lax (o retorno do Google é navegação entre sites)', () => {
  const c = cookieVolta('https://salaconf.inema.pro/entrar');
  assert.match(c, /Domain=\.inema\.pro/); assert.match(c, /SameSite=Lax/); assert.match(c, /Secure/);
});

test('acesso: 200 com email, 403 sem assinatura, sem cookie nem consulta; cache e repasse do cookie renovado', async () => {
  const chamadas = [];
  const ac = criarAcesso({ verificador: 'http://falso', buscar: buscarFalso(chamadas) });
  assert.equal((await ac.quem('tema=x')).status, 401);
  assert.equal(chamadas.length, 0);
  const r = await ac.quem(`tema=x; ${SB('maria')}`);
  assert.equal(r.status, 200); assert.equal(r.email, 'maria@x.com');
  assert.equal(chamadas[0], SB('maria'), 'só o cookie de sessão vai para o verificador');
  await ac.quem(SB('maria'));
  assert.equal(chamadas.length, 1, 'segunda consulta sai do cache');
  assert.equal((await ac.quem(SB('semassin'))).status, 403);
  const rn = await ac.quem(SB('renova'));
  assert.deepEqual(rn.novos, ['sb-ref-auth-token=novo; Domain=.inema.pro; Path=/']);
});

function montarSala() {
  process.env.SALA_DONO_EMAIL = 'Dono@X.com';
  const banco = abrirBanco(':memory:');
  const perfil = JSON.parse(fs.readFileSync(path.join(RAIZ, 'perfis', 'pessoa.json'), 'utf8'));
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-teste-'));
  const sala = criarSala({ perfil, banco, motor: falso, raiz: RAIZ, dados, externo: async () => {} });
  delete process.env.SALA_DONO_EMAIL;
  return { banco, sala };
}

test('web: dono reconhecido pelo email do .env; desconhecido vira pedido; dono aceita e ele entra', async () => {
  const { banco, sala } = montarSala();
  assert.equal(banco.porEmail('dono@x.com').id, 'dono');
  const r = await sala.pedirEntradaWeb({ email: 'Ana@X.com' });
  assert.ok(r.pedido); assert.equal(r.pedido.dados.email, 'ana@x.com');
  assert.ok((await sala.pedirEntradaWeb({ email: 'ana@x.com' })).repetido, 'não duplica pedido');
  await assert.rejects(sala.aprovar(r.pedido.id, 'tiza'), /só o dono/);
  const ap = await sala.aprovar(r.pedido.id, 'dono');
  assert.equal(ap.participante.papel, 'convidado');
  assert.equal(banco.porEmail('ana@x.com').id, ap.participante.id);
  assert.ok((await sala.pedirEntradaWeb({ email: 'ana@x.com' })).ja);
  assert.ok((await sala.pedirEntradaWeb({ email: 'dono@x.com' })).ja);
});

test('web: convidado pelo dono entra direto; recusado não entra; removido pede de novo', async () => {
  const { banco, sala } = montarSala();
  assert.throws(() => sala.convidarEmail('bia@x.com', 'tiza'), /só o dono/);
  const p = sala.convidarEmail('bia@x.com', 'dono', 'Bia');
  assert.equal(banco.porEmail('bia@x.com').nome, 'Bia');
  assert.throws(() => sala.convidarEmail('dono@x.com', 'dono'), /já é de Dono/);
  await sala.remover(p.id, 'dono');
  assert.equal(banco.porEmail('bia@x.com'), undefined);
  assert.ok((await sala.pedirEntradaWeb({ email: 'bia@x.com' })).pedido, 'removido pelo dono pede de novo');
  const c = await sala.pedirEntradaWeb({ email: 'caio@x.com' });
  await sala.recusar(c.pedido.id, 'dono');
  assert.equal(banco.porEmail('caio@x.com'), undefined);
});

// ---------- servidor de verdade (processo filho) com SALA_LOGIN=inema e verificador falso ----------
function ouvir(srv) { return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv.address().port))); }

test('servidor com login: página pública, /entrar, guarda das APIs e identidade do login', async (t) => {
  const falsoV = http.createServer((req, res) => { const v = veredito(req.headers.cookie); res.writeHead(v.status, { 'content-type': 'application/json', ...v.headers }); res.end(v.body ? JSON.stringify(v.body) : ''); });
  const pv = await ouvir(falsoV);
  const porta = 4700 + Math.floor(Math.random() * 200);
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-login-'));
  const filho = spawn(process.execPath, ['--no-warnings', 'server.mjs', '--perfil', 'pessoa', '--porta', String(porta)], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SALA_LOGIN: 'inema', SALA_VERIFICADOR_URL: `http://127.0.0.1:${pv}/`, SALA_AGENTES: 'falso', SALA_DADOS: dados,
      SALA_TELEGRAM_TOKEN: '', SALA_DONO_EMAIL: 'dono@x.com', SALA_TIZA_EMAIL: '', SALA_DONO_SENHA: '', SALA_HOST: '127.0.0.1' },
  });
  t.after(() => { filho.kill(); falsoV.close(); });
  await new Promise((ok, falha) => { filho.stdout.on('data', (d) => /\[sala\]/.test(d) && ok()); filho.on('exit', (c) => falha(new Error(`saiu ${c}`))); });
  const base = `http://127.0.0.1:${porta}`;
  const ir = (p, cookie, op = {}) => fetch(base + p, { redirect: 'manual', ...op, headers: { ...(cookie ? { cookie } : {}), ...(op.headers || {}) } });

  const ini = await ir('/');
  assert.equal(ini.status, 200); assert.match(await ini.text(), /Entrar com a conta INEMA\.PRO/);
  assert.equal((await ir('/api/estado')).status, 401, 'sem login a sala não abre');
  assert.equal((await ir('/api/stream')).status, 401);
  assert.equal((await ir('/sala')).headers.get('location'), '/entrar');

  const sem = await ir('/entrar');
  assert.equal(sem.headers.get('location'), 'https://www.inema.pro/entrar');
  assert.match(sem.headers.get('set-cookie'), /inema_volta=.*salaconf\.inema\.pro%2Fentrar.*Domain=\.inema\.pro/);
  assert.equal((await ir('/entrar', SB('semassin'))).headers.get('location'), '/?assinante=nao');

  assert.equal((await ir('/entrar', SB('dono'))).headers.get('location'), '/sala');
  const est = await (await ir('/api/estado', SB('dono'))).json();
  assert.equal(est.eu.id, 'dono'); assert.equal(est.eu.dono, true);
  assert.ok(est.participantes.every((p) => !('email' in p)), 'emails não vazam no estado');

  // Desconhecido: pedido e espera; a API da sala continua fechada para ele.
  assert.equal((await ir('/entrar', SB('ana'))).headers.get('location'), '/aguardando');
  const eu = await (await ir('/api/eu', SB('ana'))).json();
  assert.equal(eu.pendente, true); assert.equal(eu.eu, null);
  assert.equal((await ir('/api/estado', SB('ana'))).status, 401);

  // Dono logado aceita sem senha; ana entra e fala como ela mesma, mesmo mandando "de" de outro.
  const pend = (await (await ir('/api/estado', SB('dono'))).json()).pendentes.find((a) => a.tipo === 'convite');
  const ap = await ir('/api/aprovar', SB('dono'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: pend.id }) });
  assert.equal(ap.status, 200, await ap.clone().text());
  assert.equal((await ir('/entrar', SB('ana'))).headers.get('location'), '/sala');
  const msg = await ir('/api/mensagem', SB('ana'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ de: 'dono', texto: 'oi, sem ferramenta' }) });
  assert.equal(msg.status, 200);
  await new Promise((r) => setTimeout(r, 300));
  const evs = (await (await ir('/api/estado', SB('dono'))).json()).eventos.filter((e) => e.tipo === 'mensagem' && e.texto === 'oi, sem ferramenta');
  assert.equal(evs.length, 1); assert.equal(evs[0].de, 'web-ana-x-com');

  // Convidada não aprova mudança de configuração nem convida.
  const cv = await ir('/api/convidar', SB('ana'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'z@x.com' }) });
  assert.equal(cv.status, 403);

  // Sessão renovada no inema.pro volta ao navegador.
  const rn = await ir('/api/eu', SB('renova'));
  assert.match(rn.headers.get('set-cookie') || '', /sb-ref-auth-token=novo/);
});
