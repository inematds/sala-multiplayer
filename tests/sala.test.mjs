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
  assert.ok(banco.eventos().some((e) => e.tipo === 'sistema' && /Teto de 4 turnos/.test(e.texto)));
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
