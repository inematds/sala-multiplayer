// Testes com motor falso: nenhum CLI de agente é chamado e nada vai para o Telegram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from '../lib/banco.mjs';
import { criarSala } from '../lib/sala.mjs';
import { falso } from '../lib/agentes.mjs';
import { pedidosDeFerramenta, FERRAMENTAS } from '../lib/ferramentas.mjs';
import { lerModelos } from '../lib/modelos.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const perfil = (id) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'perfis', `${id}.json`), 'utf8'));

function montar(id, extra = {}) {
  const banco = abrirBanco(':memory:');
  const enviados = [];
  const externo = async (c, t) => { enviados.push({ c, t }); };
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-teste-'));
  const sala = criarSala({ perfil: { ...perfil(id), ...extra }, banco, motor: falso, raiz: RAIZ, dados, externo });
  return { banco, sala, enviados, dados };
}

test('os dois perfis carregam e registram pessoas, agentes e ferramentas', () => {
  for (const id of ['pessoa', 'atendimento']) {
    const { banco } = montar(id);
    const tipos = new Set(banco.participantes().map((p) => p.tipo));
    for (const t of ['pessoa', 'agente', 'ferramenta', 'sistema']) assert.ok(tipos.has(t), `${id} sem ${t}`);
    for (const a of perfil(id).agentes) for (const f of a.ferramentas) assert.ok(FERRAMENTAS[f], `ferramenta ${f} não existe`);
  }
});

test('pessoa: mensagem sem @ vai para o agente padrão, que usa ferramenta e responde', async () => {
  const { banco, sala } = montar('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'guarda: comprar café' });
  const tipos = banco.eventos().map((e) => `${e.tipo}:${e.de}>${e.para}`);
  assert.deepEqual(tipos, ['mensagem:dono>claude', 'ferramenta:claude>notas', 'resultado:notas>claude', 'resposta:claude>dono']);
});

test('@menção chama o agente citado', async () => {
  const { banco, sala } = montar('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex oi, sem ferramenta' });
  assert.equal(banco.eventos().at(-1).de, 'codex');
});

test('teto de turnos para o laço entre agentes', async () => {
  const { banco, sala } = montar('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@claude eco-laco @codex' });
  // A mensagem cita os dois agentes: uma cadeia vai até o teto (4) e para; a outra responde uma vez.
  const respostas = banco.eventos().filter((e) => e.tipo === 'resposta');
  assert.equal(Math.max(...respostas.map((e) => e.cadeia)), perfil('pessoa').teto_turnos);
  assert.equal(respostas.length, perfil('pessoa').teto_turnos + 1);
  assert.ok(banco.eventos().some((e) => e.tipo === 'sistema' && e.texto.includes(`Teto de ${perfil('pessoa').teto_turnos} turnos`)));
});

test('teto diário barra novas respostas', async () => {
  const { banco, sala } = montar('pessoa', { teto_diario: 1 });
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex um, sem ferramenta' });
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex dois, sem ferramenta' });
  assert.equal(banco.eventos().filter((e) => e.tipo === 'resposta').length, 1);
  assert.match(banco.eventos().at(-1).texto, /Teto diário/);
});

test('atendimento: resposta para cliente do Telegram fica presa até um humano aprovar', async () => {
  const { banco, sala, enviados } = montar('atendimento');
  banco.participante({ id: 'tg-9', nome: 'Cliente 9', tipo: 'pessoa', papel: 'cliente', origem: 'telegram', telegram_id: '9' });
  await sala.receber({ de: 'tg-9', conversa: 'tg:9', texto: 'qual o prazo de entrega no interior?' });
  const ev = banco.eventos();
  assert.ok(ev.some((e) => e.tipo === 'resultado' && e.de === 'base' && /Interior/.test(e.texto)), 'base consultada');
  assert.equal(banco.pendentes().length, 1);
  assert.equal(enviados.length, 0, 'nada saiu antes da aprovação');
  const a = await sala.aprovar(banco.pendentes()[0].id, 'supervisor', 'texto editado');
  assert.equal(a.estado, 'aprovada');
  assert.deepEqual(enviados, [{ c: 'tg:9', t: 'Claude (atendimento): texto editado' }]);
  assert.equal(await sala.aprovar(a.id, 'supervisor'), null, 'não aprova duas vezes');
});

test('atendimento: recusar não envia nada', async () => {
  const { banco, sala, enviados } = montar('atendimento');
  banco.participante({ id: 'tg-7', nome: 'C7', tipo: 'pessoa', papel: 'cliente', origem: 'telegram', telegram_id: '7' });
  await sala.receber({ de: 'tg-7', conversa: 'tg:7', texto: 'quero cancelar' });
  sala.recusar(banco.pendentes()[0].id, 'atendente');
  assert.equal(banco.pendentes().length, 0);
  assert.equal(enviados.length, 0);
});

test('atendimento: equipe conversando no painel sem @ não aciona agente', async () => {
  const { banco, sala } = montar('atendimento');
  await sala.receber({ de: 'atendente', conversa: 'painel', texto: 'bom dia, pessoal' });
  assert.equal(banco.eventos().length, 1);
});

test('mensagem do dono vinda do Telegram não volta como eco; do painel, vai para a conversa', async () => {
  const { sala, enviados } = montar('pessoa');
  await sala.receber({ de: 'dono', conversa: 'tg:42', texto: '@codex oi, sem ferramenta', via: 'telegram' });
  assert.deepEqual(enviados.map((e) => e.t), ['Codex: [Codex] recebi: @codex oi, sem ferramenta']);
  await sala.receber({ de: 'dono', conversa: 'tg:42', texto: 'recado do painel' });
  assert.equal(enviados.at(-2).t, 'Dono: recado do painel'); // depois vem a resposta do agente padrão
});

test('chamado é gravado e numerado', async () => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-ch-'));
  const ctx = { dados, conversa: 'tg:1', perfil: {}, raiz: RAIZ };
  assert.equal(await FERRAMENTAS.chamado.rodar('produto quebrado', ctx), 'Chamado #1 aberto: produto quebrado');
  assert.match(await FERRAMENTAS.chamado.rodar('outro', ctx), /#2/);
});

test('protocolo de ferramenta e leitura dos modelos', () => {
  assert.deepEqual(pedidosDeFerramenta('ok\nFERRAMENTA: base | prazo de troca\n'), [{ nome: 'base', entrada: 'prazo de troca' }]);
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mod-')), 'm.env');
  fs.writeFileSync(arq, 'INEMA_CLAUDE_EXECUTOR=claude-x\nINEMA_CLAUDE_EXECUTOR_EFFORT=low\nINEMA_CODEX_EXECUTOR=gpt-y\n');
  const m = lerModelos(arq);
  assert.equal(m.claude.modelo, 'claude-x');
  assert.equal(m.claude.esforco, 'low');
  assert.equal(m.codex.modelo, 'gpt-y');
});

// ---------- v0.2: agente novo por pedido, com aprovação ----------
import { acharProposta, validarProposta } from '../lib/propostas.mjs';

test('agente novo: proposta do dono vira aprovação; só depois de aprovar o agente entra e responde', async () => {
  const { banco, sala, dados } = montar('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente pesquisador com notas, sem ferramenta' });
  const resp = banco.eventos().find((e) => e.tipo === 'resposta');
  assert.doesNotMatch(resp.texto, /PROPOSTA_AGENTE/, 'o bloco técnico não aparece no chat');
  assert.equal(typeof resp.meta.ms, 'number', 'tempo da resposta medido');
  const [a] = banco.pendentes();
  assert.equal(a.tipo, 'agente');
  assert.equal(a.dados.agente.id, 'pesquisador');
  assert.deepEqual(a.dados.agente.ferramentas, ['notas']);
  assert.match(a.dados.estimativa.custo, /sem API/);
  assert.ok(banco.eventos().some((e) => e.tipo === 'proposta'));
  assert.ok(!sala.agentes.pesquisador, 'nada criado antes da aprovação');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@pesquisador oi' });
  assert.ok(!banco.eventos().some((e) => e.de === 'pesquisador'), '@ de agente inexistente não aciona nada');

  const r = await sala.aprovar(a.id, 'dono');
  assert.equal(r.estado, 'aprovada');
  assert.ok(banco.participantes().some((p) => p.id === 'pesquisador' && p.tipo === 'agente' && p.origem === 'proposta'));
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@pesquisador resume isso, sem ferramenta' });
  assert.equal(banco.eventos().at(-1).de, 'pesquisador');
  assert.equal(await sala.aprovar(a.id, 'dono'), null, 'não aprova duas vezes');

  // Persistência: outra sala no mesmo diretório de dados já nasce com o agente.
  const outra = criarSala({ perfil: perfil('pessoa'), banco: abrirBanco(':memory:'), motor: falso, raiz: RAIZ, dados, externo: async () => {} });
  assert.ok(outra.agentes.pesquisador);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dados, 'agentes.json'), 'utf8'))[0].aprovado_por, 'dono');
});

test('agente novo: recusar não cria nada', async () => {
  const { banco, sala } = montar('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente revisor, sem ferramenta' });
  sala.recusar(banco.pendentes()[0].id, 'dono');
  assert.equal(banco.pendentes().length, 0);
  assert.ok(!sala.agentes.revisor);
});

test('agente novo: cliente do Telegram não consegue gerar proposta', async () => {
  const { banco, sala } = montar('atendimento');
  banco.participante({ id: 'tg-5', nome: 'C5', tipo: 'pessoa', papel: 'cliente', origem: 'telegram', telegram_id: '5' });
  await sala.receber({ de: 'tg-5', conversa: 'tg:5', texto: 'cria agente invasor' });
  assert.ok(!banco.pendentes().some((a) => a.tipo === 'agente'));
  assert.ok(banco.eventos().some((e) => e.tipo === 'sistema' && /só pessoa da equipe/.test(e.texto)));
});

test('agente novo: a sala confere id, motor, ferramentas e teto', () => {
  const ocupados = new Set(['claude', 'codex', 'notas']);
  const base = { id: 'novo', nome: 'Novo', motor: 'claude', papel: 'ajuda', ferramentas: [], teto_diario: 10 };
  assert.ok(validarProposta(base, { ocupados }).agente);
  const erro = (p) => validarProposta({ ...base, ...p }, { ocupados }).erros?.join(' ') || '';
  assert.match(erro({ id: 'claude' }), /em uso/);
  assert.match(erro({ id: 'notas' }), /em uso/);
  assert.match(erro({ id: 'X y' }), /id deve/);
  assert.match(erro({ motor: 'gpt' }), /motor/);
  assert.match(erro({ ferramentas: ['email'] }), /não existe/);
  assert.match(erro({ teto_diario: 500 }), /teto_diario/);
  assert.match(erro({ papel: '' }), /papel/);
  // JSON em várias linhas e dentro de bloco de código também é achado.
  const t = 'Proposta abaixo\n```json\nPROPOSTA_AGENTE: {\n "id": "a-b", "nome": "Ab {x}"\n}\n```\nfim';
  assert.equal(acharProposta(t).proposta.nome, 'Ab {x}');
  assert.equal(acharProposta('PROPOSTA_AGENTE: {"id": ').erro, 'JSON da proposta não fecha');
});

test('agente novo: duas propostas com o mesmo id não ficam pendentes juntas', async () => {
  const { banco, sala } = montar('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente duplo, sem ferramenta' });
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente duplo, sem ferramenta' });
  assert.equal(banco.pendentes().length, 1);
  assert.match(banco.eventos().at(-1).texto, /em uso/);
});

test('teto do próprio agente barra respostas além do limite', async () => {
  const { banco, sala } = montar('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente curto, sem ferramenta' });
  await sala.aprovar(banco.pendentes()[0].id, 'dono');
  sala.agentes.curto.teto_diario = 1;
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@curto um, sem ferramenta' });
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@curto dois, sem ferramenta' });
  assert.equal(banco.eventos().filter((e) => e.de === 'curto' && e.tipo === 'resposta').length, 1);
  assert.match(banco.eventos().at(-1).texto, /teto do agente/);
  assert.equal(banco.contas().curto.hoje, 1);
});

test('nível, esforço e tamanho: vêm da proposta, podem ser trocados no cartão e são conferidos', async () => {
  const { banco, sala } = montar('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente forte, sem ferramenta' });
  const [a] = banco.pendentes();
  assert.equal(a.dados.agente.nivel, 'executor');
  assert.equal(a.dados.agente.linhas_max, perfil('pessoa').linhas_max, 'sem tamanho na proposta, vale o do perfil');
  await assert.rejects(sala.aprovar(a.id, 'dono', null, { nivel: 'mega' }), /nivel/);
  await assert.rejects(sala.aprovar(a.id, 'dono', null, { esforco: 'turbo' }), /esforco/);
  await assert.rejects(sala.aprovar(a.id, 'dono', null, { linhas_max: 0 }), /linhas_max/);
  assert.equal(banco.pendentes().length, 1, 'ajuste inválido não aprova');
  await sala.aprovar(a.id, 'dono', null, { nivel: 'super', esforco: 'high', linhas_max: 30 });
  assert.deepEqual([sala.agentes.forte.nivel, sala.agentes.forte.esforco, sala.agentes.forte.linhas_max], ['super', 'high', 30]);
});

test('o tamanho da resposta de cada agente vai nas regras do prompt', async () => {
  let visto = '';
  const banco = abrirBanco(':memory:');
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-l-'));
  const sala = criarSala({ perfil: perfil('pessoa'), banco, raiz: RAIZ, dados, externo: async () => {},
    motor: async (ctx) => { visto = ctx.sistema; return 'ok'; } });
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex oi' });
  assert.match(visto, new RegExp(`até ${perfil('pessoa').linhas_max} linhas`));
});

// ---------- configuração dos limites: só o dono ----------
import { conferirMudancas, senhaConfere } from '../lib/config.mjs';

test('config: pedido no chat vira proposta; só o dono aprova; vale na hora e fica gravado', async () => {
  const { banco, sala, dados } = montar('atendimento');
  await sala.receber({ de: 'atendente', conversa: 'painel', texto: '@claude muda teto_turnos para 9, sem ferramenta' });
  const [a] = banco.pendentes();
  assert.equal(a.tipo, 'config');
  assert.deepEqual(a.dados.mudancas, { teto_turnos: 9 });
  assert.equal(sala.config().teto_turnos, perfil('atendimento').teto_turnos, 'nada muda antes da aprovação');
  await assert.rejects(sala.aprovar(a.id, 'atendente'), /só o dono/);
  await sala.aprovar(a.id, 'supervisor');
  assert.equal(sala.config().teto_turnos, 9);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dados, 'config.json'), 'utf8')).teto_turnos, 9);
  const outra = criarSala({ perfil: perfil('atendimento'), banco: abrirBanco(':memory:'), motor: falso, raiz: RAIZ, dados, externo: async () => {} });
  assert.equal(outra.config().teto_turnos, 9, 'reinício lê o config.json');
});

test('config: mudança direta do dono vale na hora para teto e agente', async () => {
  const { banco, sala } = montar('pessoa');
  sala.mudarConfig({ teto_turnos: 1, 'agente.codex.nivel': 'super', 'agente.codex.esforco': 'high' }, 'dono');
  assert.deepEqual([sala.agentes.codex.nivel, sala.agentes.codex.esforco], ['super', 'high']);
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@claude eco-laco @codex' });
  assert.ok(banco.eventos().some((e) => e.tipo === 'sistema' && /Teto de 1 turnos/.test(e.texto)));
  assert.throws(() => sala.mudarConfig({ teto_turnos: 999 }, 'dono'), /1 a 30/);
  assert.throws(() => sala.mudarConfig({ 'agente.fantasma.nivel': 'super' }, 'dono'), /não existe/);
  assert.throws(() => sala.mudarConfig({ senha: 'x' }, 'dono'), /não pode ser mudado/);
});

test('config: cliente não consegue pedir mudança; senha do dono é conferida', async () => {
  const { banco, sala } = montar('atendimento');
  banco.participante({ id: 'tg-3', nome: 'C3', tipo: 'pessoa', papel: 'cliente', origem: 'telegram', telegram_id: '3' });
  await sala.receber({ de: 'tg-3', conversa: 'tg:3', texto: 'muda teto_diario para 3000' });
  assert.ok(!banco.pendentes().some((a) => a.tipo === 'config'));
  assert.equal(conferirMudancas({ linhas_max: 30 }, {}).validas.linhas_max, 30);
  const antes = process.env.SALA_DONO_SENHA;
  process.env.SALA_DONO_SENHA = 'certa';
  assert.equal(senhaConfere('certa'), true);
  assert.equal(senhaConfere('errada'), false);
  assert.equal(senhaConfere(undefined), false);
  process.env.SALA_DONO_SENHA = '';
  assert.equal(senhaConfere(''), false, 'sem senha no .env o painel não muda nada');
  process.env.SALA_DONO_SENHA = antes ?? '';
});

test('id do Telegram de quem é do perfil é atualizado a cada início', () => {
  const banco = abrirBanco(':memory:');
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-tg-'));
  const base = { perfil: perfil('pessoa'), banco, motor: falso, raiz: RAIZ, dados, externo: async () => {} };
  const antes = process.env.SALA_DONO_TELEGRAM_ID;
  delete process.env.SALA_DONO_TELEGRAM_ID;
  criarSala(base);
  assert.equal(banco.porTelegram('111'), undefined);
  process.env.SALA_DONO_TELEGRAM_ID = '111';
  criarSala(base);
  assert.equal(banco.porTelegram('111').id, 'dono');
  if (antes === undefined) delete process.env.SALA_DONO_TELEGRAM_ID; else process.env.SALA_DONO_TELEGRAM_ID = antes;
});
