// Estado compartilhado das três telas: carrega /api/estado e acompanha /api/stream (SSE).
export const S = { estado: null };

const ICONES = {
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  cliente: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/><path d="M19 3l2 2-2 2"/>',
  agente: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
  ferramenta: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  sistema: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  telegram: '<path d="M22 3 2 11l7 2 2 7 4-5 5 4z"/><path d="m9 13 6-5"/>',
};
export const ROTULO = { pessoa: 'Pessoa', cliente: 'Cliente', agente: 'Agente', ferramenta: 'Ferramenta', sistema: 'Sistema' };

export const icone = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[k] || ''}</svg>`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function part(id) { return S.estado?.participantes.find((p) => p.id === id) || { id, nome: id, tipo: id === 'sala' ? 'sistema' : 'sistema' }; }
// Classe visual: cliente é pessoa, mas aparece com cor própria.
export function classe(p) { return p.tipo === 'pessoa' && p.papel === 'cliente' ? 'cliente' : p.tipo; }
export function nomeConversa(c) {
  if (c === 'painel') return 'Painel da equipe';
  if (c.startsWith('tg:')) {
    const p = S.estado.participantes.find((x) => x.telegram_id && `tg:${x.telegram_id}` === c);
    return `Telegram · ${p ? p.nome : c.slice(3)}`;
  }
  return c;
}

export function nav(ativa) {
  const e = S.estado;
  const tema = (() => { try { return localStorage.getItem('sala-tema'); } catch { return null; } })();
  if (tema === 'light') document.body.classList.add('light');
  const el = document.createElement('nav');
  el.className = 'nav';
  el.innerHTML = `
    <a class="logo" href="/">Sala multiplayer</a>
    <span class="perfil">${esc(e.perfil.nome)}</span>
    <span class="selo ${e.modo === 'falso' ? 'alerta' : ''}" title="agentes">${e.modo === 'falso' ? 'agentes falsos' : 'agentes reais'}</span>
    <span class="selo" title="Telegram">${icone('telegram')} ${e.telegram ? 'ligado' : 'desligado'}</span>
    <div class="links">
      <a href="/" class="${ativa === 'sala' ? 'on' : ''}">Sala</a>
      <a href="/grafo" class="${ativa === 'grafo' ? 'on' : ''}">Grafo</a>
      <a href="/fluxo" class="${ativa === 'fluxo' ? 'on' : ''}">Fluxo</a>
      <a href="/config" class="${ativa === 'config' ? 'on' : ''}">Config</a>
    </div>
    <a class="inema" href="https://inema.club" target="_blank" rel="noopener">INEMA.CLUB</a>
    <button class="tema" aria-label="tema claro ou escuro">${document.body.classList.contains('light') ? '☀️' : '🌙'}</button>`;
  el.querySelector('.tema').onclick = (ev) => {
    const claro = document.body.classList.toggle('light');
    ev.currentTarget.textContent = claro ? '☀️' : '🌙';
    try { localStorage.setItem('sala-tema', claro ? 'light' : 'dark'); } catch { /* sem storage */ }
  };
  document.body.prepend(el);
}

export async function iniciar(aoMudar) {
  S.estado = await (await fetch('/api/estado')).json();
  const es = new EventSource('/api/stream');
  const on = (tipo, f) => es.addEventListener(tipo, (m) => { const d = JSON.parse(m.data); f(d); aoMudar(tipo, d); });
  on('evento', (d) => {
    S.estado.eventos.push(d); if (S.estado.eventos.length > 1500) S.estado.eventos.shift();
    if (d.tipo === 'resposta' && d.meta?.ms) {
      const c = (S.estado.contas[d.de] ||= { total: 0, hoje: 0, ms: 0 });
      c.total++; c.hoje++; c.ms += d.meta.ms; c.mediaS = Math.round(c.ms / c.total / 100) / 10;
    }
  });
  on('participante', (d) => {
    // Novo entra na lista; já existente (convidado ligado/desligado) é atualizado.
    const i = S.estado.participantes.findIndex((p) => p.id === d.id);
    if (i < 0) S.estado.participantes.push(d); else S.estado.participantes[i] = { ...S.estado.participantes[i], ...d };
    // Agente novo aprovado: busca de novo motor, nível e esforço.
    if (d.tipo === 'agente') fetch('/api/estado').then((r) => r.json()).then((e) => { S.estado.agentes = e.agentes; aoMudar('agentes', e.agentes); }).catch(() => {});
  });
  on('aprovacao', (d) => {
    S.estado.pendentes = S.estado.pendentes.filter((p) => p.id !== d.id);
    if (d.estado === 'pendente') S.estado.pendentes.push(d);
  });
  on('ativos', (d) => { S.estado.ativos = d; });
  on('config', (d) => { S.estado.config = d; S.estado.perfil.teto_turnos = d.teto_turnos; S.estado.perfil.teto_diario = d.teto_diario; });
  on('stats', (d) => { S.estado.stats = d; });
  return S.estado;
}

export async function postar(url, corpo) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  return r.json();
}
