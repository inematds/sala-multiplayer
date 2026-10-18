// Grupos de agentes com nome (@jogos chama @critico e @codex). Nascem por pedido no chat:
// o agente propõe com  PROPOSTA_GRUPO: {"id": "jogos", "membros": ["critico", "codex"]}
// e só o dono aprova. Ficam em data/<perfil>/grupos.json.
import fs from 'node:fs';
import path from 'node:path';

const arquivo = (dados) => path.join(dados, 'grupos.json');
const RESERVADOS = new Set(['todos', 'sala', 'sistema', 'dono']);

export function lerGrupos(dados) {
  try { return JSON.parse(fs.readFileSync(arquivo(dados), 'utf8')); } catch { return {}; }
}

export function gravarGrupos(dados, grupos) {
  fs.mkdirSync(dados, { recursive: true });
  fs.writeFileSync(arquivo(dados), JSON.stringify(grupos, null, 2) + '\n');
}

// Confere a proposta. ocupados: ids que já são agente, ferramenta ou participante.
// Grupo que já existe é atualizado; {"id": "x", "remover": true} apaga.
export function conferirGrupo(p, { agentes, grupos, ocupados }) {
  if (!p || typeof p !== 'object') return { erros: ['proposta vazia'] };
  const id = String(p.id || '').toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9_-]{1,19}$/.test(id)) return { erros: ['id do grupo: 2 a 20 letras minúsculas, números, - ou _'] };
  if (p.remover === true) return grupos[id] ? { grupo: { id, remover: true } } : { erros: [`não existe grupo @${id}`] };
  if (RESERVADOS.has(id)) return { erros: [`@${id} é reservado`] };
  if (!grupos[id] && ocupados.has(id)) return { erros: [`@${id} ${ocupados.get(id)}`] };
  const membros = [...new Set((Array.isArray(p.membros) ? p.membros : []).map((m) => String(m).toLowerCase().replace(/^@/, '').trim()))];
  const fora = membros.filter((m) => !agentes[m]);
  if (fora.length) return { erros: [`não são agentes da sala: ${fora.map((m) => '@' + m).join(', ')}`] };
  if (membros.length < 2) return { erros: ['grupo precisa de pelo menos 2 agentes'] };
  const nome = String(p.nome || id).slice(0, 40);
  return { grupo: { id, nome, membros } };
}

export function resumoGrupo(g) {
  return g.remover ? `Apagar o grupo @${g.id}.` : `Grupo @${g.id} (${g.nome}): chama ${g.membros.map((m) => '@' + m).join(', ')}.`;
}

export function instrucaoGrupo() {
  return [
    'Se uma pessoa da equipe pedir para CRIAR, MUDAR ou APAGAR UM GRUPO de agentes (um @nome que chama vários de uma vez), não diga que criou: proponha. Explique em uma linha e termine com UMA linha:',
    'PROPOSTA_GRUPO: {"id": "jogos", "nome": "Jogos", "membros": ["critico", "codex"]}',
    'Para apagar: PROPOSTA_GRUPO: {"id": "jogos", "remover": true}. Membros só entre os agentes da sala. Só o dono da sala aprova.',
  ].join('\n');
}
