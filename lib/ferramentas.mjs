// Ferramentas de exemplo. Cada uma aparece como participante (tipo "ferramenta") e cada uso vira
// duas setas no grafo: agente → ferramenta (pedido) e ferramenta → agente (resultado).
// O agente pede com uma linha:  FERRAMENTA: <nome> | <entrada>
import fs from 'node:fs';
import path from 'node:path';

const normaliza = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const FERRAMENTAS = {
  base: {
    nome: 'Base de respostas',
    desc: 'procura na base de respostas do atendimento (perguntas frequentes, prazos, regras)',
    async rodar(entrada, ctx) {
      const arq = path.resolve(ctx.raiz, ctx.perfil.base || 'perfis/base-atendimento.md');
      if (!fs.existsSync(arq)) return 'Base de respostas não encontrada.';
      const blocos = fs.readFileSync(arq, 'utf8').split(/\n(?=## )/).filter((b) => b.startsWith('## '));
      const termos = normaliza(entrada).split(/\W+/).filter((t) => t.length > 3);
      const nota = blocos.map((b) => ({ b, n: termos.filter((t) => normaliza(b).includes(t)).length }))
        .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
      return nota.length ? nota.map((x) => x.b.trim()).join('\n\n') : 'Nada na base sobre isso.';
    },
  },
  chamado: {
    nome: 'Chamados',
    desc: 'abre um chamado para a equipe humana resolver (entrada: resumo do problema)',
    async rodar(entrada, ctx) {
      const arq = path.join(ctx.dados, 'chamados.jsonl');
      fs.mkdirSync(ctx.dados, { recursive: true });
      const n = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').split('\n').filter(Boolean).length + 1 : 1;
      fs.appendFileSync(arq, JSON.stringify({ n, hora: new Date().toISOString(), conversa: ctx.conversa, resumo: entrada }) + '\n');
      return `Chamado #${n} aberto: ${entrada}`;
    },
  },
  notas: {
    nome: 'Notas',
    desc: 'guarda uma nota (entrada: texto) ou lista as últimas (entrada: listar)',
    async rodar(entrada, ctx) {
      const arq = path.join(ctx.dados, 'notas.md');
      fs.mkdirSync(ctx.dados, { recursive: true });
      if (/^\s*listar\s*$/i.test(entrada)) {
        const linhas = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').trim().split('\n') : [];
        return linhas.length ? linhas.slice(-10).join('\n') : 'Nenhuma nota ainda.';
      }
      fs.appendFileSync(arq, `- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${entrada.trim()}\n`);
      return 'Nota guardada.';
    },
  },
  hora: {
    nome: 'Relógio',
    desc: 'diz a data e a hora atuais',
    async rodar() {
      return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    },
  },
};

// Acha os pedidos de ferramenta numa resposta de agente.
export function pedidosDeFerramenta(texto) {
  const out = [];
  for (const m of texto.matchAll(/^\s*FERRAMENTA:\s*([a-z_]+)\s*\|\s*(.+)$/gim)) out.push({ nome: m[1].toLowerCase(), entrada: m[2].trim() });
  return out;
}

export const semPedidos = (texto) => texto.replace(/^\s*FERRAMENTA:.*$/gim, '').trim();
