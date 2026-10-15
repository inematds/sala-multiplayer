// Teste de fumaça dos motores reais (Claude Code e Codex pela assinatura): uma rodada da sala
// de atendimento com um cliente simulado, sem Telegram. Gasta 2–4 chamadas da assinatura.
// Uso: node --no-warnings tools/fumaca.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from '../lib/banco.mjs';
import { criarSala } from '../lib/sala.mjs';
import { claude, codex } from '../lib/agentes.mjs';
import { lerModelos } from '../lib/modelos.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const perfil = JSON.parse(fs.readFileSync(path.join(RAIZ, 'perfis/atendimento.json'), 'utf8'));
const modelos = lerModelos();
const banco = abrirBanco(':memory:');
const motor = (c) => (c.agente.motor === 'codex' ? codex : claude)({ ...c, ...modelos[c.agente.motor] });
const sala = criarSala({ perfil, banco, motor, raiz: RAIZ, dados: fs.mkdtempSync(path.join(os.tmpdir(), 'fumaca-')) });
banco.participante({ id: 'tg-1', nome: 'Cliente teste', tipo: 'pessoa', papel: 'cliente', origem: 'telegram', telegram_id: '1' });

const t0 = Date.now();
await sala.receber({ de: 'tg-1', conversa: 'tg:fumaca', texto: 'Oi, comprei ontem e moro no interior. Quando chega?' });
await sala.receber({ de: 'atendente', conversa: 'tg:fumaca', texto: '@codex a resposta pendente para o cliente está certa?' });
for (const e of banco.eventos()) console.log(`${e.tipo.padEnd(10)} ${e.de} → ${e.para}: ${e.texto.replace(/\s+/g, ' ').slice(0, 160)}`);
console.log(`pendentes: ${banco.pendentes().length} · ${(Date.now() - t0) / 1000}s · modelos: claude ${modelos.claude.modelo || 'padrão'}, codex ${modelos.codex.modelo || 'padrão'}`);
