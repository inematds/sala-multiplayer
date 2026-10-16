// Configuração dos limites da sala. Só o dono do perfil muda: pelo painel com a senha do .env,
// pelo Telegram (/config) a partir do id dele, ou aprovando uma proposta de mudança feita por um agente.
// Fica em data/<perfil>/config.json (fora do git) e vale na hora, sem reiniciar.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NIVEIS } from './modelos.mjs';

const ESFORCOS = ['', 'low', 'medium', 'high', 'xhigh'];
const inteiro = (min, max) => ({ tipo: 'inteiro', min, max });

// O que pode ser mudado. Campos da sala e, por agente, os que começam com "agente.<id>.".
export const CAMPOS_SALA = {
  teto_turnos: { ...inteiro(1, 30), rotulo: 'Turnos seguidos entre agentes' },
  teto_diario: { ...inteiro(1, 3000), rotulo: 'Respostas de agentes por dia (sala toda)' },
  linhas_max: { ...inteiro(1, 60), rotulo: 'Tamanho padrão da resposta (linhas)' },
};
export const CAMPOS_AGENTE = {
  nivel: { tipo: 'lista', opcoes: NIVEIS, rotulo: 'Nível do modelo' },
  esforco: { tipo: 'lista', opcoes: ESFORCOS, rotulo: 'Esforço' },
  linhas_max: { ...inteiro(1, 60), rotulo: 'Resposta até (linhas)' },
  teto_diario: { ...inteiro(1, 400), rotulo: 'Respostas por dia' },
};

function conferirValor(def, v) {
  if (def.tipo === 'inteiro') {
    const n = Number(v);
    return Number.isInteger(n) && n >= def.min && n <= def.max ? { valor: n } : { erro: `deve ser inteiro de ${def.min} a ${def.max}` };
  }
  const s = String(v ?? '').toLowerCase();
  return def.opcoes.includes(s) ? { valor: s } : { erro: `deve ser ${def.opcoes.map((o) => o || '(vazio)').join(', ')}` };
}

// mudancas: { "teto_turnos": 20, "agente.revisor.nivel": "super" }. Devolve { validas } ou { erros }.
export function conferirMudancas(mudancas, agentes) {
  if (!mudancas || typeof mudancas !== 'object' || Array.isArray(mudancas)) return { erros: ['mudanças devem ser um objeto campo: valor'] };
  const erros = [], validas = {};
  for (const [campo, v] of Object.entries(mudancas)) {
    const m = campo.match(/^agente\.([a-z0-9-]+)\.([a-z_]+)$/);
    const def = m ? CAMPOS_AGENTE[m[2]] : CAMPOS_SALA[campo];
    if (!def) { erros.push(`${campo}: campo que não pode ser mudado`); continue; }
    if (m && !agentes[m[1]]) { erros.push(`${campo}: agente @${m[1]} não existe`); continue; }
    const r = conferirValor(def, v);
    if (r.erro) erros.push(`${campo} ${r.erro}`); else validas[campo] = r.valor;
  }
  if (!Object.keys(validas).length && !erros.length) erros.push('nenhuma mudança');
  return erros.length ? { erros } : { validas };
}

export function valorAtual(campo, perfil, agentes) {
  const m = campo.match(/^agente\.([a-z0-9-]+)\.([a-z_]+)$/);
  if (!m) return perfil[campo];
  const a = agentes[m[1]] || {};
  if (m[2] === 'nivel') return a.nivel || 'executor';
  if (m[2] === 'esforco') return a.esforco || '';
  return a[m[2]] ?? null;
}

const arquivo = (dados) => path.join(dados, 'config.json');
export function lerConfig(dados) {
  try { return JSON.parse(fs.readFileSync(arquivo(dados), 'utf8')); } catch { return {}; }
}

// Aplica nas estruturas vivas (perfil e agentes) e, se gravar=true, acumula no config.json.
export function aplicar(validas, { perfil, agentes, dados, gravar = true }) {
  for (const [campo, v] of Object.entries(validas)) {
    const m = campo.match(/^agente\.([a-z0-9-]+)\.([a-z_]+)$/);
    if (m) { if (agentes[m[1]]) agentes[m[1]][m[2]] = v; } else perfil[campo] = v;
  }
  if (gravar) {
    const atual = lerConfig(dados);
    fs.mkdirSync(dados, { recursive: true });
    fs.writeFileSync(arquivo(dados), JSON.stringify({ ...atual, ...validas }, null, 2) + '\n');
  }
}

export function resumo(validas, perfil, agentes) {
  return Object.entries(validas).map(([c, v]) => `${c}: ${valorAtual(c, perfil, agentes) ?? '—'} → ${v === '' ? '(padrão)' : v}`).join('; ');
}

// Senha do dono (SALA_DONO_SENHA no .env). Sem senha configurada, o painel não muda nada.
export function senhaConfere(dada) {
  const certa = process.env.SALA_DONO_SENHA || '';
  if (!certa || typeof dada !== 'string') return false;
  const a = crypto.createHash('sha256').update(dada).digest(), b = crypto.createHash('sha256').update(certa).digest();
  return crypto.timingSafeEqual(a, b);
}

export function instrucaoConfig() {
  const sala = Object.keys(CAMPOS_SALA).join(', ');
  const ag = Object.keys(CAMPOS_AGENTE).map((k) => `agente.<id>.${k}`).join(', ');
  return [
    'Se uma pessoa da equipe pedir para MUDAR UM LIMITE ou o modelo de um agente, não diga que mudou: proponha. Explique em uma linha e termine com UMA linha:',
    'PROPOSTA_CONFIG: {"teto_turnos": 20}',
    `Campos possíveis: ${sala}, ${ag}. nivel = super, topo, executor ou menor; esforco = "" (do nível), low, medium, high, xhigh. Só o dono da sala aprova.`,
  ].join('\n');
}
