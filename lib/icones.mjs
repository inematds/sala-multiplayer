// Ícone de cada participante: um diferente para cada um. Quem não escolheu ganha um da lista
// do seu tipo, na ordem de chegada, pulando os já usados. A escolha fica em data/<perfil>/icones.json.
import fs from 'node:fs';
import path from 'node:path';

const arquivo = (dados) => path.join(dados, 'icones.json');

export const LISTAS = {
  agente: ['🤖', '🦉', '🦊', '🐙', '🧠', '🦾', '🛰️', '🧪', '🐝', '🦄', '🐬', '🦅', '🐢', '🦁', '🐺', '🪐', '⚙️', '🔮', '🧭', '📐'],
  pessoa: ['🙂', '😎', '🧑‍🚀', '🧑‍🎨', '🧑‍🔬', '🧑‍🏫', '🧑‍🍳', '🧑‍🌾', '🦸', '🧙', '🐼', '🐯', '🐨', '🐸', '🐵', '🌻', '🌵', '⭐', '🍀', '🎈'],
  cliente: ['🙋', '🙋‍♀️', '🙋‍♂️', '💁', '💁‍♀️', '💁‍♂️'],
  ferramenta: ['🛠️', '📒', '🔎', '🧮', '📎', '🗂️', '📅', '🧰'],
  sistema: ['⚠️'],
};
const tipoDe = (p) => (p.tipo === 'pessoa' && p.papel === 'cliente' ? 'cliente' : LISTAS[p.tipo] ? p.tipo : 'sistema');

export function lerIcones(dados) {
  try { return JSON.parse(fs.readFileSync(arquivo(dados), 'utf8')); } catch { return {}; }
}

export function gravarIcones(dados, icones) {
  fs.mkdirSync(dados, { recursive: true });
  fs.writeFileSync(arquivo(dados), JSON.stringify(icones, null, 2) + '\n');
}

// Um emoji ou até 4 letras/símbolos, sem HTML. '' volta ao padrão.
export function conferirIcone(v) {
  const s = String(v ?? '').trim();
  if (s === '') return { icone: '' };
  if (/[<>&"'`\\]/.test(s) || /\s/.test(s)) return { erro: 'ícone inválido' };
  const partes = [...new Intl.Segmenter('pt', { granularity: 'grapheme' }).segment(s)];
  if (partes.length > 4) return { erro: 'ícone: um emoji ou até 4 caracteres' };
  return { icone: s };
}

// id → ícone para todos. Escolhidos primeiro; os demais pegam o próximo livre da lista do tipo.
export function atribuir(participantes, escolhidos) {
  const out = {}, usados = new Set();
  for (const p of participantes) if (escolhidos[p.id]) { out[p.id] = escolhidos[p.id]; usados.add(escolhidos[p.id]); }
  // A vaga de cada um na lista é a ordem de chegada no tipo (conta quem escolheu também):
  // assim trocar um ícone não mexe no padrão dos outros, salvo choque com um escolhido.
  const pos = {};
  for (const p of participantes) {
    const t = tipoDe(p), lista = LISTAS[t];
    const vaga = pos[t] = (pos[t] ?? -1) + 1;
    if (out[p.id]) continue;
    if (t === 'sistema') { out[p.id] = lista[0]; continue; }
    let ic = null;
    for (let k = 0; k < lista.length && !ic; k++) { const c = lista[(vaga + k) % lista.length]; if (!usados.has(c)) ic = c; }
    for (let n = 2; !ic; n++) if (!usados.has(`${lista[0]}${n}`)) ic = `${lista[0]}${n}`;
    out[p.id] = ic; usados.add(ic);
  }
  return out;
}
