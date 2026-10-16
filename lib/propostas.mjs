// Agente novo por pedido: o agente da sala escreve a proposta, o código confere e estima,
// e o agente só entra depois que um aprovador do perfil aprovar.
// O agente pede com:  PROPOSTA_AGENTE: {"id": "...", "nome": "...", "motor": "claude", ...}
import fs from 'node:fs';
import path from 'node:path';
import { FERRAMENTAS } from './ferramentas.mjs';
import { NIVEIS } from './modelos.mjs';

const MOTORES = ['claude', 'codex'];
const RESERVADOS = ['sistema', 'sala', 'todos', 'painel'];
const TETO_AGENTE_MAX = 400;
const ESFORCOS = ['', 'low', 'medium', 'high', 'xhigh'];
const LINHAS_MAX = 60;

// Nível do modelo, esforço e tamanho da resposta: vêm da proposta e podem ser trocados no cartão de aprovação.
function conferirAjustes(p, erros, linhasPadrao) {
  const nivel = String(p.nivel || 'executor').toLowerCase();
  if (!NIVEIS.includes(nivel)) erros.push(`nivel deve ser ${NIVEIS.join(', ')}`);
  const esforco = String(p.esforco ?? '').toLowerCase();
  if (!ESFORCOS.includes(esforco)) erros.push(`esforco deve ser vazio (padrão do nível) ou ${ESFORCOS.filter(Boolean).join(', ')}`);
  const linhas = Number(p.linhas_max ?? linhasPadrao ?? 15);
  if (!Number.isInteger(linhas) || linhas < 1 || linhas > LINHAS_MAX) erros.push(`linhas_max deve ser um inteiro de 1 a ${LINHAS_MAX}`);
  return { nivel, esforco, linhas_max: linhas };
}

export function aplicarAjustes(agente, ajustes) {
  if (!ajustes) return { agente };
  const erros = [];
  const aj = conferirAjustes({ ...agente, ...ajustes }, erros);
  return erros.length ? { erros } : { agente: { ...agente, ...aj } };
}

// Acha o bloco PROPOSTA_AGENTE e o objeto JSON logo depois (pode ocupar várias linhas).
export function acharProposta(texto, marcador = 'PROPOSTA_AGENTE') {
  const i = texto.search(new RegExp(`${marcador}:\\s*`));
  if (i < 0) return null;
  const ini = texto.indexOf('{', i);
  if (ini < 0) return { erro: 'proposta sem JSON', inicio: i, fim: texto.length };
  let nivel = 0, dentro = false, esc = false;
  for (let k = ini; k < texto.length; k++) {
    const c = texto[k];
    if (dentro) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') dentro = false; continue; }
    if (c === '"') dentro = true;
    else if (c === '{') nivel++;
    else if (c === '}' && --nivel === 0) {
      let fim = k + 1;
      if (texto.slice(fim).startsWith('\n```')) fim += 4;
      try { return { proposta: JSON.parse(texto.slice(ini, k + 1)), inicio: i, fim }; }
      catch (e) { return { erro: `JSON inválido (${e.message})`, inicio: i, fim }; }
    }
  }
  return { erro: 'JSON da proposta não fecha', inicio: i, fim: texto.length };
}

export function semProposta(texto, achado) {
  if (!achado) return texto;
  return (texto.slice(0, achado.inicio).replace(/```(json)?\s*$/, '') + texto.slice(achado.fim)).trim();
}

const curto = (v, max) => String(v ?? '').trim().slice(0, max);

// Confere a proposta contra o que existe. Devolve { agente } ou { erros }.
export function validarProposta(p, { ocupados, linhasPadrao }) {
  const erros = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { erros: ['proposta não é um objeto'] };
  const id = String(p.id || '').toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,19}$/.test(id)) erros.push('id deve ter 2 a 20 letras minúsculas, números ou hífen, começando por letra');
  else if (RESERVADOS.includes(id) || ocupados.has(id)) erros.push(`o id "${id}" já está em uso`);
  if (!MOTORES.includes(p.motor)) erros.push(`motor deve ser ${MOTORES.join(' ou ')}`);
  const ferramentas = Array.isArray(p.ferramentas) ? [...new Set(p.ferramentas.map(String))] : [];
  const faltam = ferramentas.filter((f) => !FERRAMENTAS[f]);
  if (faltam.length) erros.push(`ferramenta que não existe na sala: ${faltam.join(', ')} (ferramenta nova é outro pedido)`);
  const teto = Number(p.teto_diario ?? 20);
  if (!Number.isInteger(teto) || teto < 1 || teto > TETO_AGENTE_MAX) erros.push(`teto_diario deve ser um inteiro de 1 a ${TETO_AGENTE_MAX}`);
  const aj = conferirAjustes(p, erros, linhasPadrao);
  const nome = curto(p.nome, 40), papel = curto(p.papel, 160);
  if (!nome) erros.push('falta o nome');
  if (!papel) erros.push('falta o papel');
  if (erros.length) return { erros };
  return { agente: { id, nome, motor: p.motor, ...aj, papel, persona: curto(p.persona, 800), ferramentas, teto_diario: teto, justificativa: curto(p.justificativa, 400) } };
}

// Estimativa calculada pela sala (não pelo agente): tempo medido das últimas respostas do mesmo motor.
export function estimar(agente, banco, tetoSala) {
  const doNivel = banco.medicoes({ motor: agente.motor }, 200).filter((m) => (m.nivel || 'executor') === agente.nivel).slice(0, 30);
  const med = doNivel.length ? doNivel : banco.medicoes({ motor: agente.motor }, 30);
  const media = med.length ? Math.round(med.reduce((s, m) => s + m.ms, 0) / med.length / 1000) : null;
  return {
    custo: `Assinatura do ${agente.motor === 'codex' ? 'Codex' : 'Claude Code'}, sem API e sem custo extra em dinheiro. Até ${agente.teto_diario} respostas por dia, que também contam no teto da sala (${tetoSala}/dia).`,
    tempo: media === null ? 'Sem medição ainda para este motor.' : `Cerca de ${media}s por resposta (média das últimas ${med.length} do ${agente.motor}${doNivel.length ? `, nível ${agente.nivel}` : ', outros níveis'}).`,
    ferramentas: agente.ferramentas.length ? agente.ferramentas.join(', ') : 'nenhuma',
  };
}

const arquivo = (dados) => path.join(dados, 'agentes.json');

export function lerExtras(dados) {
  try { return JSON.parse(fs.readFileSync(arquivo(dados), 'utf8')); } catch { return []; }
}

export function gravarExtras(dados, lista) {
  fs.mkdirSync(dados, { recursive: true });
  fs.writeFileSync(arquivo(dados), JSON.stringify(lista, null, 2) + '\n');
}

export function instrucaoProposta() {
  const ferr = Object.entries(FERRAMENTAS).map(([k, f]) => `${k} (${f.desc})`).join('; ');
  return [
    'Se uma pessoa da equipe pedir um AGENTE NOVO, não crie nada: proponha. Explique o agente (o que faz, como trabalha, quando chamar) e termine com UMA linha:',
    'PROPOSTA_AGENTE: {"id":"slug-curto","nome":"Nome","motor":"claude ou codex","nivel":"executor","esforco":"","linhas_max":15,"papel":"o que faz","persona":"como fala e trabalha","ferramentas":[],"teto_diario":20,"justificativa":"por que ajuda"}',
    `nivel = qualidade do modelo: super (o mais forte), topo, executor (padrão) ou menor (rápido e leve). esforco: vazio usa o do nível, ou low, medium, high, xhigh. linhas_max: tamanho máximo da resposta do agente (1 a ${LINHAS_MAX}). Se a pessoa disser qual modelo, esforço ou tamanho quer, use.`,
    `Ferramentas que existem hoje: ${ferr}. Ferramenta que não existe não entra na proposta: diga que é um pedido separado.`,
    'A sala confere a proposta, calcula custo e tempo e só cria o agente depois que um aprovador aprovar.',
  ].join('\n');
}
