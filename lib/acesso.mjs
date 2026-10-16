// Login pela conta INEMA.PRO (SALA_LOGIN=inema). A sala não confere token nenhum: repassa os cookies de sessão
// do Supabase (sb-*, valem em todo *.inema.pro) para o verificador do inema.pro e lê só o veredito.
//   200 → assinante em dia, com o email   403 → logado, mas sem assinatura   outro (307, 401, 500) → precisa logar
// Se o verificador renovar a sessão, os cookies novos voltam para o navegador (sem isso o refresh token
// rodado ficaria só aqui e a sessão do inema.pro cairia).
import crypto from 'node:crypto';

export const VERIFICADOR = 'https://www.inema.pro/api/assinatura?s=salaconf';
export const LOGIN_INEMA = 'https://www.inema.pro/entrar';
export const PAY_INEMA = 'https://pay.inema.pro/';
export const COOKIE_VOLTA = 'inema_volta';

export function cookiesSessao(cabecalho = '') {
  return String(cabecalho).split(';').map((c) => c.trim()).filter((c) => {
    const i = c.indexOf('=');
    return i > 3 && c.startsWith('sb-') && c.length - i - 1 > 20;
  });
}

// Cookie que o /auth/callback do inema.pro lê para devolver a pessoa à sala depois do login.
export function cookieVolta(url) {
  return `${COOKIE_VOLTA}=${encodeURIComponent(url)}; Domain=.inema.pro; Path=/; Max-Age=600; Secure; SameSite=Lax`;
}

export function criarAcesso({ verificador = VERIFICADOR, buscar = globalThis.fetch, cacheMs = 60e3, agora = Date.now } = {}) {
  const cache = new Map(); // hash dos cookies → { ate, r }
  const voando = new Map(); // mesma sessão consultando ao mesmo tempo: uma chamada só

  async function consultar(sessao) {
    try {
      const r = await buscar(verificador, { headers: { cookie: sessao.join('; ') }, redirect: 'manual', signal: AbortSignal.timeout(10e3) });
      const novos = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
      if (r.status === 200) {
        const j = await r.json().catch(() => ({}));
        if (j?.email) return { status: 200, email: String(j.email).toLowerCase(), novos };
        return { status: 502, novos };
      }
      return { status: r.status === 403 ? 403 : 401, novos };
    } catch {
      return { status: 503, novos: [] };
    }
  }

  // Devolve { status, email?, novos: [set-cookie...] }. Só 200 tem email.
  async function quem(cabecalho) {
    const sessao = cookiesSessao(cabecalho);
    if (!sessao.length) return { status: 401, novos: [] };
    const k = crypto.createHash('sha256').update(sessao.join(';')).digest('hex');
    const c = cache.get(k);
    if (c && c.ate > agora()) return { ...c.r, novos: [] };
    if (voando.has(k)) return voando.get(k);
    const p = consultar(sessao).then((r) => {
      voando.delete(k);
      // Só guarda veredito firme; falha de rede (503) consulta de novo na próxima.
      if (r.status !== 503) cache.set(k, { ate: agora() + cacheMs, r: { status: r.status, email: r.email } });
      if (cache.size > 2000) cache.delete(cache.keys().next().value);
      return r;
    });
    voando.set(k, p);
    return p;
  }

  return { quem };
}

// ---------- login do dono por usuário e senha (SALA_DONO_SENHA), ao lado do INEMA.PRO ----------
// Cookie assinado "sala_sessao=<id>.<expira>.<hmac>". A chave junta um segredo guardado em data/<perfil>/segredo
// com a senha do dono: trocar a senha derruba as sessões abertas.
export const COOKIE_SESSAO = 'sala_sessao';
const DIAS_SESSAO = 30;

export function criarSessoes({ segredo, senha = () => process.env.SALA_DONO_SENHA || '', agora = Date.now, seguro = true }) {
  const chave = () => crypto.createHash('sha256').update(`${segredo}|${senha()}`).digest();
  const assinar = (txt) => crypto.createHmac('sha256', chave()).update(txt).digest('base64url');
  return {
    criar(id) {
      const txt = `${id}.${agora() + DIAS_SESSAO * 864e5}`;
      return `${COOKIE_SESSAO}=${txt}.${assinar(txt)}; Path=/; Max-Age=${DIAS_SESSAO * 86400}; HttpOnly; SameSite=Lax${seguro ? '; Secure' : ''}`;
    },
    apagar: () => `${COOKIE_SESSAO}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${seguro ? '; Secure' : ''}`,
    // Devolve o id ou null.
    ler(cabecalho = '') {
      if (!senha()) return null;
      const c = String(cabecalho).split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE_SESSAO}=`));
      const m = c?.slice(COOKIE_SESSAO.length + 1).match(/^([a-z0-9_-]+)\.(\d+)\.([A-Za-z0-9_-]+)$/);
      if (!m || Number(m[2]) < agora()) return null;
      const certa = Buffer.from(assinar(`${m[1]}.${m[2]}`)), dada = Buffer.from(m[3]);
      return certa.length === dada.length && crypto.timingSafeEqual(certa, dada) ? m[1] : null;
    },
  };
}

// Freio de tentativas de senha: até 5 erros por IP em 10 min.
export function criarFreio({ max = 5, janelaMs = 10 * 60e3, agora = Date.now } = {}) {
  const erros = new Map();
  const vivos = (ip) => (erros.get(ip) || []).filter((t) => t > agora() - janelaMs);
  return {
    bloqueado: (ip) => vivos(ip).length >= max,
    errou(ip) { erros.set(ip, [...vivos(ip), agora()]); if (erros.size > 5000) erros.delete(erros.keys().next().value); },
    acertou: (ip) => erros.delete(ip),
  };
}
