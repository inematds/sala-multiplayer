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

test('dono liga pessoa do perfil ao Telegram com /entrar: vale na hora e no reinício', () => {
  const banco = abrirBanco(':memory:');
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-ent-'));
  const base = { perfil: perfil('pessoa'), banco, motor: falso, raiz: RAIZ, dados, externo: async () => {} };
  const sala = criarSala(base);
  sala.ligarTelegram('tiza', '555', 'dono');
  assert.equal(banco.porTelegram('555').id, 'tiza');
  assert.throws(() => sala.ligarTelegram('fulano', '556', 'dono'), /não está no perfil/);
  assert.throws(() => sala.ligarTelegram('tiza', 'abc', 'dono'), /inválido/);
  const banco2 = abrirBanco(':memory:');
  criarSala({ ...base, banco: banco2 });
  assert.equal(banco2.porTelegram('555').id, 'tiza');
});

// ---------- v0.5: laço entre agentes, rodada e convidado pelo Telegram ----------
import { mencoesDiretas, ehEco } from '../lib/sala.mjs';

function montarComAvisos(id, extra = {}, motor = falso) {
  const banco = abrirBanco(':memory:');
  const avisos = [], enviados = [];
  const externo = async (c, t) => { enviados.push({ c, t }); };
  externo.avisar = async (tid, t) => { avisos.push({ tid: String(tid), t }); };
  externo.avisarAprovadores = async (a) => { avisos.push({ tid: 'aprovadores', t: a.texto, a }); };
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-v5-'));
  const sala = criarSala({ perfil: { ...perfil(id), ...extra }, banco, motor, raiz: RAIZ, dados, externo });
  return { banco, sala, avisos, enviados, dados };
}

test('menção direta: só o @ no começo da frase chama (textos reais da sala)', () => {
  assert.deepEqual(mencoesDiretas('Dono, resumo do que espera por você:\n1. Aprovar o @topicos (responda "aprovo").\n2. Pedir ao @codex que comece o painel.\n3. Aprovar o @critico.'), []);
  assert.deepEqual(mencoesDiretas('@codex, o Dono quer sua opinião sobre a proposta do agente "Crítico" (@critico)'), ['codex']);
  assert.deepEqual(mencoesDiretas('@claude e @codex, vejam isto'), ['claude', 'codex']);
  assert.deepEqual(mencoesDiretas('Concordo. @codex, revisa o trecho?'), ['codex']);
  assert.deepEqual(mencoesDiretas('Dono, antes de aprovar os dois (@topicos e @critico), aponto riscos'), []);
  assert.deepEqual(mencoesDiretas('- @revisor confere a ortografia'), ['revisor']);
});

test('eco: resposta que só confirma é reconhecida (textos reais da sala)', () => {
  assert.equal(ehEco('@claude, combinado. Aguardo o Dono decidir se quer seguir com o painel.'), true);
  assert.equal(ehEco('Certo. Sem novidades da minha parte até o Dono responder.'), true);
  assert.equal(ehEco('@codex, combinado, estamos alinhados. A proposta do @critico fica parada até o Dono responder.'), true);
  assert.equal(ehEco('@claude, eu faria o painel como parte da própria sala: uma lista de tópicos com título e resumo.'), false);
  assert.equal(ehEco('Combinado, mas qual critério desambigua?'), false);
});

test('eco e citação não chamam outro agente; o eco fica marcado', async () => {
  const { banco, sala } = montarComAvisos('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@claude so-confirma codex' });
  const r = banco.eventos().filter((e) => e.tipo === 'resposta');
  assert.equal(r.length, 1);
  assert.equal(r[0].meta.eco, true);
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@claude cita codex' });
  assert.ok(!banco.eventos().some((e) => e.de === 'codex'), 'citar o nome no meio da frase não chama');
});

test('agente só chama de volta quem falou com ele se perguntar algo', async () => {
  const motor = async ({ agente }) => (agente.id === 'claude' ? '@codex, escreve o comando?' : '@claude, pronto: ls -la.');
  const { banco, sala } = montarComAvisos('pessoa', {}, motor);
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@claude lista arquivos' });
  assert.deepEqual(banco.eventos().filter((e) => e.tipo === 'resposta').map((e) => e.de), ['claude', 'codex']);
  const [c, x] = banco.eventos().filter((e) => e.tipo === 'resposta');
  assert.deepEqual(c.meta.chama, ['codex']);
  assert.equal(x.meta.chama, undefined);
});

test('rodada: tudo o que uma mensagem provoca leva o id dela; pai aponta quem acionou', async () => {
  const motor = async ({ agente }) => (agente.id === 'claude' ? '@codex, escreve o comando?' : 'ls -la');
  const { banco, sala } = montarComAvisos('pessoa', {}, motor);
  const m = await sala.receber({ de: 'dono', conversa: 'painel', texto: '@claude lista arquivos' });
  const ev = banco.eventos();
  assert.ok(ev.every((e) => e.rodada === m.id));
  const [c, x] = ev.filter((e) => e.tipo === 'resposta');
  assert.equal(c.pai, m.id);
  assert.equal(x.pai, c.id);
  assert.equal(banco.eventosDaRodada(m.id).length, 3);
});

test('teto da rodada soma todos os ramos e avisa uma vez só', async () => {
  const { banco, sala } = montarComAvisos('pessoa', { teto_turnos: 30, teto_rodada: 5 });
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@claude eco-laco @codex' });
  assert.equal(banco.eventos().filter((e) => e.tipo === 'resposta').length, 5);
  assert.equal(banco.eventos().filter((e) => e.tipo === 'sistema' && /Teto da rodada/.test(e.texto)).length, 1);
  // Teto de turnos também avisa uma vez por rodada, mesmo com dois ramos batendo.
  const b = montarComAvisos('pessoa', { teto_turnos: 2, teto_rodada: 30 });
  await b.sala.receber({ de: 'dono', conversa: 'painel', texto: '@claude e @codex, eco-laco @claude' });
  assert.equal(b.banco.eventos().filter((e) => e.tipo === 'sistema' && /Teto de 2 turnos/.test(e.texto)).length, 1);
});

test('o prompt leva o estado da sala: agentes aprovados e o que espera o dono', async () => {
  let visto = '';
  const motor = async (ctx) => { visto = ctx.sistema; return falso(ctx); };
  const { sala } = montarComAvisos('pessoa', {}, motor);
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente topicos, sem ferramenta' });
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex oi, sem ferramenta' });
  assert.match(visto, /agentes na sala \(já aprovados\): @claude, @codex/);
  assert.match(visto, /#1 agente @topicos/);
  assert.match(visto, /Você \(@codex\) já está na sala/);
});

test('id em uso diz o motivo (proposta pendente ou agente que já existe)', async () => {
  const { banco, sala } = montarComAvisos('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente duplo, sem ferramenta' });
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente duplo, sem ferramenta' });
  assert.match(banco.eventos().at(-1).texto, /em uso: proposta #1 ainda esperando o dono/);
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente codex, sem ferramenta' });
  assert.match(banco.eventos().at(-1).texto, /em uso: já é um agente da sala/);
});

test('convidado: pede com /entrar, só o dono aceita, conversa e não aprova nada', async () => {
  const { banco, sala, avisos } = montarComAvisos('pessoa');
  const r = await sala.pedirEntrada({ tid: 777, nome: 'Ana', usuario: 'ana' });
  assert.equal(r.pedido.tipo, 'convite');
  assert.match(r.pedido.texto, /Ana \(@ana\) pede para entrar/);
  assert.ok(avisos.some((a) => a.tid === 'aprovadores' && a.a.id === r.pedido.id), 'dono avisado');
  assert.equal((await sala.pedirEntrada({ tid: 777, nome: 'Ana' })).repetido.id, r.pedido.id, 'um pedido por vez');
  assert.equal(banco.porTelegram('777'), undefined, 'não entra antes de aceitar');
  await assert.rejects(sala.aprovar(r.pedido.id, 'tiza'), /só o dono/);
  await assert.rejects(sala.recusar(r.pedido.id, 'tiza'), /só o dono/);
  const a = await sala.aprovar(r.pedido.id, 'dono');
  assert.equal(a.participante.papel, 'convidado');
  assert.equal(banco.porTelegram('777').id, 'tg-777');
  assert.ok(avisos.some((x) => x.tid === '777' && /entrou na sala/.test(x.t)));
  assert.ok((await sala.pedirEntrada({ tid: 777, nome: 'Ana' })).ja);
  await sala.receber({ de: 'tg-777', conversa: 'tg:777', texto: 'oi, sem ferramenta', via: 'telegram' });
  assert.equal(banco.eventos().filter((e) => e.tipo === 'resposta').at(-1).de, 'claude', 'rota padrão do convidado');
  await sala.receber({ de: 'tg-777', conversa: 'tg:777', texto: 'cria agente invasor', via: 'telegram' });
  assert.ok(!banco.pendentes().some((x) => x.tipo === 'agente'), 'convidado não propõe agente');
});

test('convidado: recusar avisa; equipe não vira convidado', async () => {
  const { sala, avisos } = montarComAvisos('pessoa');
  const r = await sala.pedirEntrada({ tid: 778, nome: 'Bia' });
  await sala.recusar(r.pedido.id, 'dono');
  assert.ok(avisos.some((x) => x.tid === '778' && /não aceitou/.test(x.t)));
  sala.ligarTelegram('tiza', '901', 'dono');
  assert.ok((await sala.pedirEntrada({ tid: 901, nome: 'Tiza' })).ja, 'quem é da equipe já está');
});

test('convidado: teto de respostas por dia', async () => {
  const { banco, sala } = montarComAvisos('pessoa', { teto_convidado: 1 });
  await sala.aprovar((await sala.pedirEntrada({ tid: 779, nome: 'Cid' })).pedido.id, 'dono');
  await sala.receber({ de: 'tg-779', conversa: 'tg:779', texto: 'um, sem ferramenta', via: 'telegram' });
  await sala.receber({ de: 'tg-779', conversa: 'tg:779', texto: 'dois, sem ferramenta', via: 'telegram' });
  assert.equal(banco.eventos().filter((e) => e.tipo === 'resposta').length, 1);
  assert.match(banco.eventos().at(-1).texto, /Teto do convidado: Cid já usou as 1/);
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex oi, sem ferramenta' });
  assert.equal(banco.eventos().at(-1).de, 'codex', 'o teto do convidado não barra o dono');
});

test('convidado: /sair e /remover desligam; volta pede aprovação nova (ou não, pela configuração)', async () => {
  const { banco, sala, avisos } = montarComAvisos('pessoa');
  await sala.aprovar((await sala.pedirEntrada({ tid: 780, nome: 'Duda' })).pedido.id, 'dono');
  await sala.sair('tg-780');
  assert.equal(banco.porTelegram('780'), undefined, 'desligado não fala na sala');
  assert.ok(banco.participantes().some((p) => p.id === 'tg-780' && p.ativo === 0 && p.saida === 'saiu'), 'histórico fica');
  assert.ok((await sala.pedirEntrada({ tid: 780, nome: 'Duda' })).pedido, 'reaprovar=sim: pedido novo');
  await sala.aprovar(banco.pendentes()[0].id, 'dono');
  assert.equal(banco.porTelegram('780').id, 'tg-780', 'mesmo participante religado');
  // reaprovar=nao: quem saiu sozinho volta direto; quem o dono removeu pede de novo.
  sala.mudarConfig({ convidado_reaprovar: 'nao' }, 'dono');
  await sala.sair('tg-780');
  assert.ok((await sala.pedirEntrada({ tid: 780, nome: 'Duda' })).voltou);
  await assert.rejects(sala.remover('duda', 'tiza'), /só o dono/);
  assert.equal((await sala.remover('duda', 'dono')).ativo, 0, 'devolve o participante já desligado');
  assert.ok(avisos.some((x) => x.tid === '780' && /desligou você/.test(x.t)));
  assert.ok((await sala.pedirEntrada({ tid: 780, nome: 'Duda' })).pedido, 'removido pelo dono sempre pede de novo');
  await assert.rejects(sala.ligarConvidado('tg-780', true, 'tiza'), /só o dono/);
  await sala.ligarConvidado('tg-780', true, 'dono');
  assert.equal(banco.porTelegram('780').id, 'tg-780', 'dono religa pelo painel');
});

test('convidado: convite com prazo vence; 0 nunca vence', async () => {
  const { banco, sala } = montarComAvisos('pessoa', { convidado_expira_h: 1 });
  await sala.aprovar((await sala.pedirEntrada({ tid: 781, nome: 'Eva' })).pedido.id, 'dono');
  const real = Date.now;
  try {
    Date.now = () => real() + 2 * 3600e3;
    assert.equal(await sala.receber({ de: 'tg-781', conversa: 'tg:781', texto: 'oi', via: 'telegram' }), null);
    assert.equal(banco.porTelegram('781'), undefined);
    sala.mudarConfig({ convidado_expira_h: 0 }, 'dono');
    await sala.ligarConvidado('tg-781', true, 'dono');
    Date.now = () => real() + 9999 * 3600e3;
    assert.ok(await sala.receber({ de: 'tg-781', conversa: 'tg:781', texto: 'oi, sem ferramenta', via: 'telegram' }));
  } finally { Date.now = real; }
});

test('config: campos novos da rodada e do convidado são conferidos', () => {
  assert.deepEqual(conferirMudancas({ teto_rodada: 20, teto_convidado: 30, convidado_reaprovar: 'nao', convidado_expira_h: 0 }, {}).validas,
    { teto_rodada: 20, teto_convidado: 30, convidado_reaprovar: 'nao', convidado_expira_h: 0 });
  assert.match(conferirMudancas({ convidado_reaprovar: 'talvez' }, {}).erros[0], /sim, nao/);
  assert.match(conferirMudancas({ teto_rodada: 0 }, {}).erros[0], /1 a 60/);
});

import { criarTelegram } from '../lib/telegram.mjs';

test('telegram: /entrar sem id, /aceitar, /sair e /remover chegam certos (fetch falso, sem rede)', async () => {
  const banco = abrirBanco(':memory:');
  banco.participante({ id: 'dono', nome: 'Dono', tipo: 'pessoa', papel: 'dono', origem: 'painel', telegram_id: '100' });
  const u = (id, chat, text, tipo = 'private', extra = {}) => ({ update_id: id, message: { text, chat: { id: chat, type: tipo }, from: { id: chat, first_name: 'Ana', username: 'ana', ...extra } } });
  const lotes = [[
    u(1, 555, '/entrar'), u(2, -9, '/entrar', 'group'), u(3, 556, 'oi'),
    u(4, 100, '/aceitar 3'), u(5, 100, '/recusar 4'), u(6, 100, '/remover ana'), u(7, 100, '/sair'),
  ]];
  const enviados = [];
  const real = globalThis.fetch;
  let tg;
  globalThis.fetch = async (url, op) => {
    const corpo = JSON.parse(op.body);
    if (url.endsWith('/getUpdates')) { const l = lotes.shift(); if (!l) tg.parar(); return { json: async () => ({ ok: true, result: l || [] }) }; }
    enviados.push(corpo);
    return { json: async () => ({ ok: true, result: {} }) };
  };
  const entradas = [], comandos = [];
  try {
    tg = criarTelegram({ token: 'x', banco, perfil: { telegram: {} }, log: () => {}, aoReceber: async () => {},
      aoEntrada: async (x) => { entradas.push(x); return 'Pedido #3 enviado'; },
      aoComando: async (c) => { comandos.push({ acao: c.acao, id: c.id, alvo: c.alvo, quem: c.quem.id }); } });
    tg.iniciar();
    for (let i = 0; i < 50 && lotes.length + 1 > 0 && comandos.length < 4; i++) await new Promise((r) => setTimeout(r, 5));
  } finally { tg.parar(); globalThis.fetch = real; }
  assert.deepEqual(entradas, [{ tid: 555, nome: 'Ana', usuario: 'ana' }]);
  const para = (chat) => enviados.filter((e) => e.chat_id === chat).map((e) => e.text);
  assert.deepEqual(para(555), ['Pedido #3 enviado']);
  assert.match(para(-9)[0], /conversa privada/);
  assert.match(para(556)[0], /mande \/entrar/);
  assert.deepEqual(comandos, [
    { acao: 'aprovar', id: 3, alvo: undefined, quem: 'dono' }, { acao: 'recusar', id: 4, alvo: undefined, quem: 'dono' },
    { acao: 'remover', id: undefined, alvo: 'ana', quem: 'dono' }, { acao: 'sair', id: undefined, alvo: undefined, quem: 'dono' },
  ]);
});

// ---------- v0.6: rodadas e faixa de resolução (public/rodadas.js, mesmo código do Fluxo visual) ----------
import { rodadas, resolucao } from '../public/rodadas.js';

test('rodadas: uma por mensagem, ramos pelo pai, proposta resolvida pela aprovação', async () => {
  const { banco, sala } = montarComAvisos('pessoa');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@claude e @codex, so-confirma codex' });
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente topicos, sem ferramenta' });
  let rs = rodadas(banco.eventos());
  assert.equal(rs.length, 2);
  assert.equal(rs[0].nRamos, 2, 'claude e codex acionados direto = dois ramos');
  const estado = () => ({ participantes: banco.participantes(), pendentes: banco.pendentes() });
  let res = resolucao(rs[0], estado());
  assert.deepEqual([res.respostas, res.ecos, res.agentes.sort().join()], [2, 2, 'claude,codex']);
  res = resolucao(rs[1], estado());
  assert.equal(res.propostas[0].estado, 'pendente');
  assert.match(res.pendentes[0], /^#1 esperando decisão/);
  await sala.aprovar(1, 'dono');
  rs = rodadas(banco.eventos());
  res = resolucao(rs[1], estado());
  assert.equal(res.propostas[0].estado, 'aprovada', 'a aprovação (fora da rodada) volta para a rodada da proposta');
  assert.equal(res.propostas[0].quem, 'dono');
  assert.match(res.decidido[0], /^#1 aprovada às/);
});

test('rodadas: eventos antigos sem rodada são agrupados pela hora e marcados como aproximados', () => {
  const ev = [
    { id: 1, tipo: 'mensagem', de: 'dono', para: 'claude', texto: 'a', hora: '2026-10-16T04:00:00Z' },
    { id: 2, tipo: 'resposta', de: 'claude', para: 'dono', texto: 'b', hora: '2026-10-16T04:00:05Z', meta: { ms: 5000 } },
    { id: 3, tipo: 'sistema', de: 'sistema', para: 'codex', texto: 'Teto de 10 turnos entre agentes atingido; Codex não foi chamado.', hora: '2026-10-16T04:00:06Z' },
    { id: 4, tipo: 'mensagem', de: 'dono', para: 'claude', texto: 'c', hora: '2026-10-16T04:01:00Z', rodada: 4 },
    { id: 5, tipo: 'pedido', de: 'sistema', para: 'dono', texto: 'Ana pede', hora: '2026-10-16T04:02:00Z', meta: { aprovacao: 9 } },
  ];
  const rs = rodadas(ev);
  assert.deepEqual(rs.map((r) => [r.chave, r.aprox, r.eventos.length]), [['a1', true, 3], ['4', false, 1]]);
  const res = resolucao(rs[0], { participantes: [{ id: 'claude', tipo: 'agente' }], pendentes: [] });
  assert.equal(res.tetos.length, 1);
  assert.equal(res.ms, 5000);
});

// ---------- v0.7: tópicos ----------
async function comTopicos(extra = {}) {
  const m = montarComAvisos('pessoa', extra);
  await m.sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente topicos, sem ferramenta' });
  await m.sala.aprovar(m.banco.pendentes()[0].id, 'dono');
  return m;
}

test('tópicos sem o agente: a sala junta rodadas seguidas da mesma conversa, sem resumo escrito', async () => {
  const { banco, sala } = montarComAvisos('pessoa');
  const a = await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex, como listo arquivos? sem ferramenta' });
  const b = await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex e os ocultos? sem ferramenta' });
  const [t] = banco.topicos();
  assert.equal(banco.topicos().length, 1);
  assert.deepEqual([t.fonte, t.titulo, t.resumo, t.rodadas], ['sala', 'como listo arquivos? sem ferramenta', '', [a.id, b.id]]);
  await sala.receber({ de: 'dono', conversa: 'tg:42', texto: '@codex outra conversa, sem ferramenta' });
  assert.equal(banco.topicos().length, 2, 'outra conversa, outro tópico');
  // Mais de 15 min depois, na mesma conversa: tópico novo.
  const velha = banco.evento({ conversa: 'painel', de: 'dono', para: 'claude', tipo: 'mensagem', texto: 'assunto de amanhã', rodada: 'propria', hora: new Date(Date.now() + 3600e3).toISOString() });
  await sala.organizar(velha);
  assert.equal(banco.topicos().length, 3);
  assert.ok(!banco.eventos().some((e) => e.tipo === 'topico'), 'sem agente não gasta resposta');
});

test('tópicos com o agente aprovado: ele resume, decide atualizar ou abrir, e conta no teto', async () => {
  const { banco, sala } = await comTopicos();
  const antes = banco.chamadasHoje();
  const a = await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex painel de tópicos, sem ferramenta' });
  let [t] = banco.topicos();
  assert.deepEqual([t.fonte, t.titulo, t.pendente], ['topicos', 'painel de tópicos, sem ferramenta', ['Dono decide']]);
  assert.match(t.resumo, /^Resumo de:/);
  const ev = banco.eventos().find((e) => e.tipo === 'topico');
  assert.deepEqual([ev.rodada, ev.meta.topico, ev.de], [a.id, t.id, 'topicos']);
  assert.equal(banco.chamadasHoje(), antes + 2, 'resposta do codex + tópico contam no teto diário');
  const b = await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex mesmo assunto, sem ferramenta' });
  [t] = banco.topicos();
  const doAgente = () => banco.topicos().filter((x) => x.fonte === 'topicos');
  assert.equal(doAgente().length, 1, 'mesmo assunto atualiza o tópico aberto');
  assert.deepEqual(t.rodadas, [a.id, b.id]);
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex outro tema, sem ferramenta' });
  assert.equal(doAgente().length, 2);
});

test('tópicos: resposta inválida do agente cai no agrupamento da sala; teto do agente também', async () => {
  const { banco, sala } = await comTopicos();
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex topico-quebrado, sem ferramenta' });
  assert.match(banco.eventos().at(-1).texto, /não devolveu um tópico válido/);
  assert.equal(banco.topicos()[0].fonte, 'sala');
  await sala.receber({ de: 'dono', conversa: 'tg:8', texto: '@codex válido, sem ferramenta' });
  assert.equal(banco.topicos()[0].fonte, 'topicos');
  sala.agentes.topicos.teto_diario = banco.respostasHoje('topicos');
  await sala.receber({ de: 'dono', conversa: 'tg:9', texto: '@codex outra, sem ferramenta' });
  assert.equal(banco.topicos()[0].fonte, 'sala', 'no teto, a sala agrupa sem chamar o agente');
});

test('tópicos: o agente recebe os tópicos abertos e a regra de não inventar decisão', async () => {
  let ctxVisto = null;
  const motor = async (ctx) => { if (ctx.tarefa === 'topicos') ctxVisto = ctx; return falso(ctx); };
  const { banco, sala } = montarComAvisos('pessoa', {}, motor);
  await sala.receber({ de: 'dono', conversa: 'painel', texto: 'cria agente topicos, sem ferramenta' });
  await sala.aprovar(banco.pendentes()[0].id, 'dono');
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex primeiro, sem ferramenta' });
  await sala.receber({ de: 'dono', conversa: 'painel', texto: '@codex segundo, sem ferramenta' });
  assert.match(ctxVisto.sistema, /Não invente decisão/);
  assert.match(ctxVisto.prompt, /#2 primeiro, sem ferramenta — Resumo de:/);
  assert.match(ctxVisto.prompt, /Dono: @codex segundo/);
});
