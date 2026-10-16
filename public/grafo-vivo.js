// Grafo de quem conversa com quem, usado na página Grafo (grande) e na coluna direita da Sala (compacto).
import { S, icone, esc, part, classe, ROTULO } from '/comum.js';

const NS = 'http://www.w3.org/2000/svg';
const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function criarGrafo(svg, { compacto = false, aoClicar } = {}) {
  let pos = {};
  const R = compacto ? 15 : 22, corte = compacto ? 13 : 22;

  // Colunas: pessoas da equipe e clientes à esquerda, agentes no meio, ferramentas à direita, sistema embaixo.
  function layout(W, H) {
    const col = { pessoa: [], agente: [], ferramenta: [], sistema: [] };
    for (const p of S.estado.participantes) (col[p.tipo] || col.sistema).push(p);
    const estreito = W < 600;
    const xs = { pessoa: W * (estreito ? 0.16 : 0.15), agente: W * 0.5, ferramenta: W * (estreito ? 0.84 : 0.85) };
    pos = {};
    for (const [t, lista] of Object.entries(col)) {
      if (t === 'sistema') { lista.forEach((p) => { pos[p.id] = { x: W * 0.5, y: H - (compacto ? 40 : 62), p }; }); continue; }
      const topo = compacto ? 40 : 80, fundo = H - (compacto ? 100 : 150);
      lista.forEach((p, i) => { pos[p.id] = { x: xs[t], y: lista.length === 1 ? (topo + fundo) / 2 : topo + (i * (fundo - topo)) / (lista.length - 1), p }; });
    }
  }

  function curva(a, b) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.min(60, Math.abs(a.x - b.x) * 0.15) - (a.x === b.x ? 40 : 0);
    return `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`;
  }

  function desenhar() {
    if (!S.estado) return;
    const W = svg.clientWidth || 800, H = svg.clientHeight || 500;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    layout(W, H);
    const pares = {};
    const agora = Date.now();
    for (const e of S.estado.eventos.slice(-400)) {
      if (!pos[e.de] || !pos[e.para] || e.de === e.para) continue;
      const k = [e.de, e.para].sort().join('|');
      pares[k] ??= { a: e.de, b: e.para, n: 0, ult: 0 };
      pares[k].n++;
      pares[k].ult = Math.max(pares[k].ult, Date.parse(e.hora));
    }
    svg.innerHTML = '';
    const g1 = document.createElementNS(NS, 'g'), g2 = document.createElementNS(NS, 'g');
    for (const [k, p] of Object.entries(pares)) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', curva(pos[p.a], pos[p.b]));
      path.setAttribute('class', 'aresta' + (agora - p.ult < 60000 ? ' quente' : ''));
      path.setAttribute('stroke-width', String((compacto ? 1 : 1.5) + Math.log2(1 + p.n) * (compacto ? 1.1 : 1.6)));
      path.dataset.k = k;
      const t = document.createElementNS(NS, 'title'); t.textContent = `${part(p.a).nome} ↔ ${part(p.b).nome}: ${p.n} mensagens`;
      path.append(t);
      g1.append(path);
    }
    for (const { x, y, p } of Object.values(pos)) {
      const c = classe(p);
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `no t-${c}`);
      g.setAttribute('transform', `translate(${x},${y})`);
      g.setAttribute('tabindex', '0');
      const ativo = S.estado.ativos.includes(p.id);
      const esc_ = compacto ? 0.55 : 0.75, meio = 12 * esc_;
      g.innerHTML = `<title>${esc(p.nome)} · ${ROTULO[c]}</title><circle r="${R}" fill="var(--bg2)" stroke="currentColor" stroke-width="${ativo ? 3.5 : 1.6}"/>
        ${ativo && !calmo ? `<circle r="${R}" fill="none" stroke="currentColor" stroke-width="2"><animate attributeName="r" from="${R}" to="${R + 12}" dur="1.2s" repeatCount="indefinite"/><animate attributeName="opacity" from=".8" to="0" dur="1.2s" repeatCount="indefinite"/></circle>` : ''}
        <g transform="translate(${-meio},${-meio}) scale(${esc_})" class="ic" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icone(c).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
        <text y="${R + 16}" text-anchor="middle">${esc(p.nome.length > corte ? p.nome.slice(0, corte - 1) + '…' : p.nome)}</text>
        ${compacto && !ativo ? '' : `<text class="pa" y="${R + (compacto ? 28 : 32)}" text-anchor="middle">${compacto ? 'trabalhando' : ROTULO[c] + (ativo ? ' · trabalhando' : '')}</text>`}`;
      g.onclick = () => aoClicar ? aoClicar(p.id) : (location.href = `/?p=${encodeURIComponent(p.id)}`);
      g.onkeydown = (ev) => { if (ev.key === 'Enter') g.onclick(); };
      g2.append(g);
    }
    svg.append(g1, g2);
  }

  // Uma bolinha percorre a linha de quem mandou para quem recebeu.
  function pulso(e) {
    if (calmo || !pos[e.de] || !pos[e.para] || e.de === e.para) return;
    const k = [e.de, e.para].sort().join('|');
    const path = svg.querySelector(`path[data-k="${CSS.escape(k)}"]`);
    if (!path) return;
    const ida = e.de < e.para;
    const L = path.getTotalLength();
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', compacto ? '4' : '6'); dot.setAttribute('fill', 'var(--amb)');
    svg.append(dot);
    const t0 = performance.now();
    (function passo(t) {
      const f = Math.min(1, (t - t0) / 900);
      const pt = path.getPointAtLength((ida ? f : 1 - f) * L);
      dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
      if (f < 1) requestAnimationFrame(passo); else dot.remove();
    })(t0);
  }

  new ResizeObserver(() => desenhar()).observe(svg);
  return { desenhar, pulso };
}
