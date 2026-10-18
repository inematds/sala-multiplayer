// Registro de tudo o que acontece na sala: participantes, eventos (mensagens, ferramentas) e aprovações.
// SQLite nativo do Node (node:sqlite). Cada gravação avisa os ouvintes (painel ao vivo via SSE).
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

export function abrirBanco(arquivo) {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec(`
    CREATE TABLE IF NOT EXISTS participantes (
      id TEXT PRIMARY KEY, nome TEXT, tipo TEXT, papel TEXT, origem TEXT, telegram_id TEXT, criado TEXT);
    CREATE TABLE IF NOT EXISTS eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, hora TEXT, conversa TEXT, de TEXT, para TEXT,
      tipo TEXT, texto TEXT, cadeia INTEGER, meta TEXT);
    CREATE TABLE IF NOT EXISTS aprovacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, hora TEXT, conversa TEXT, de TEXT, para TEXT,
      texto TEXT, estado TEXT, decidido_por TEXT, decidido_em TEXT);
    CREATE INDEX IF NOT EXISTS ev_hora ON eventos(hora);
    CREATE TABLE IF NOT EXISTS topicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, conversa TEXT, titulo TEXT, estado TEXT, resumo TEXT,
      decidido TEXT, pendente TEXT, rodadas TEXT, fonte TEXT, criado TEXT, atualizado TEXT);
  `);
  // v0.2: aprovação pode ser de resposta (texto) ou de agente novo (dados = proposta validada).
  const colunas = db.prepare('PRAGMA table_info(aprovacoes)').all().map((c) => c.name);
  if (!colunas.includes('tipo')) db.exec("ALTER TABLE aprovacoes ADD COLUMN tipo TEXT DEFAULT 'resposta'");
  if (!colunas.includes('dados')) db.exec('ALTER TABLE aprovacoes ADD COLUMN dados TEXT');
  // v0.5: cada evento sabe a mensagem humana que abriu a rodada e o evento que o acionou.
  const colEv = db.prepare('PRAGMA table_info(eventos)').all().map((c) => c.name);
  if (!colEv.includes('rodada')) db.exec('ALTER TABLE eventos ADD COLUMN rodada INTEGER');
  if (!colEv.includes('pai')) db.exec('ALTER TABLE eventos ADD COLUMN pai INTEGER');
  // v0.5: convidado do Telegram pode ser desligado (ativo=0) e religado; saida diz por quê.
  const colPa = db.prepare('PRAGMA table_info(participantes)').all().map((c) => c.name);
  if (!colPa.includes('ativo')) db.exec('ALTER TABLE participantes ADD COLUMN ativo INTEGER DEFAULT 1');
  if (!colPa.includes('saida')) db.exec('ALTER TABLE participantes ADD COLUMN saida TEXT');
  if (!colPa.includes('desde')) db.exec('ALTER TABLE participantes ADD COLUMN desde TEXT');
  // v0.11: login pela conta INEMA.PRO — quem entra pela web é reconhecido pelo email.
  if (!colPa.includes('email')) db.exec('ALTER TABLE participantes ADD COLUMN email TEXT');
  const lerAprov = (a) => (a ? { ...a, tipo: a.tipo || 'resposta', dados: a.dados ? JSON.parse(a.dados) : null } : a);
  const lerTopico = (t) => (t ? { ...t, decidido: JSON.parse(t.decidido || '[]'), pendente: JSON.parse(t.pendente || '[]'), rodadas: JSON.parse(t.rodadas || '[]') } : t);
  const bus = new EventEmitter();
  bus.setMaxListeners(200);
  const agora = () => new Date().toISOString();

  const api = {
    bus,
    participante(p) {
      const atual = db.prepare('SELECT * FROM participantes WHERE id=?').get(p.id);
      if (atual) return atual;
      const novo = { nome: p.id, papel: '', origem: 'painel', telegram_id: null, ...p, criado: agora() };
      db.prepare('INSERT INTO participantes (id,nome,tipo,papel,origem,telegram_id,criado,ativo,desde,email) VALUES (?,?,?,?,?,?,?,1,?,?)')
        .run(novo.id, novo.nome, novo.tipo, novo.papel, novo.origem, novo.telegram_id ? String(novo.telegram_id) : null, novo.criado, novo.criado, novo.email ? String(novo.email).toLowerCase() : null);
      novo.ativo = 1;
      bus.emit('participante', novo);
      return novo;
    },
    // O id do Telegram de quem é do perfil vem do .env e pode mudar entre execuções.
    definirTelegram(id, tid) {
      db.prepare('UPDATE participantes SET telegram_id=? WHERE id=?').run(tid ? String(tid) : null, id);
    },
    // O email de quem é do perfil vem do .env (email_env), como o id do Telegram.
    definirEmail(id, email) {
      db.prepare('UPDATE participantes SET email=? WHERE id=?').run(email ? String(email).toLowerCase() : null, id);
    },
    // Email de pessoa do perfil vence convidado web com o mesmo email (que nasceu antes do .env ter o email).
    liberarEmail(email, dono) {
      if (!email) return 0;
      return db.prepare("UPDATE participantes SET email=NULL, ativo=0 WHERE email=? AND id<>? AND papel='convidado'")
        .run(String(email).toLowerCase(), dono).changes;
    },
    porEmail(email) {
      return db.prepare('SELECT * FROM participantes WHERE email=? AND COALESCE(ativo,1)=1').get(String(email).toLowerCase());
    },
    qualquerEmail(email) {
      return db.prepare('SELECT * FROM participantes WHERE email=?').get(String(email).toLowerCase());
    },
    // Só quem está ativo. Convidado desligado não fala na sala até ser aceito de novo.
    porTelegram(tid) {
      return db.prepare('SELECT * FROM participantes WHERE telegram_id=? AND COALESCE(ativo,1)=1').get(String(tid));
    },
    // Qualquer um com esse id, ativo ou não (para saber se é convidado que saiu ou foi removido).
    qualquerTelegram(tid) {
      return db.prepare('SELECT * FROM participantes WHERE telegram_id=?').get(String(tid));
    },
    // Liga ou desliga um participante. saida: 'saiu' (ele mesmo), 'removido' (dono), 'expirou'.
    ativar(id, ativo, saida = null, extra = {}) {
      db.prepare('UPDATE participantes SET ativo=?, saida=?, desde=?, nome=COALESCE(?,nome), telegram_id=COALESCE(?,telegram_id) WHERE id=?')
        .run(ativo ? 1 : 0, ativo ? null : saida, agora(), extra.nome ?? null, extra.telegram_id ? String(extra.telegram_id) : null, id);
      const p = db.prepare('SELECT * FROM participantes WHERE id=?').get(id);
      bus.emit('participante', p);
      return p;
    },
    participantes() {
      return db.prepare('SELECT * FROM participantes ORDER BY tipo, nome').all();
    },
    evento(e) {
      const r = { hora: agora(), cadeia: 0, meta: null, rodada: null, pai: null, ...e };
      const info = db.prepare('INSERT INTO eventos (hora,conversa,de,para,tipo,texto,cadeia,meta,rodada,pai) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(r.hora, r.conversa, r.de, r.para, r.tipo, r.texto, r.cadeia, r.meta ? JSON.stringify(r.meta) : null, r.rodada === 'propria' ? null : r.rodada, r.pai);
      r.id = Number(info.lastInsertRowid);
      // Mensagem humana abre a própria rodada (id = rodada).
      if (e.rodada === 'propria') { db.prepare('UPDATE eventos SET rodada=? WHERE id=?').run(r.id, r.id); r.rodada = r.id; }
      bus.emit('evento', r);
      return r;
    },
    eventos(limite = 300) {
      return db.prepare('SELECT * FROM eventos ORDER BY id DESC LIMIT ?').all(limite).reverse()
        .map((e) => ({ ...e, meta: e.meta ? JSON.parse(e.meta) : null }));
    },
    conversa(conversa, limite = 20) {
      return db.prepare('SELECT * FROM eventos WHERE conversa=? AND tipo IN (\'mensagem\',\'resposta\',\'resultado\',\'rascunho\',\'proposta\') ORDER BY id DESC LIMIT ?')
        .all(conversa, limite).reverse();
    },
    pedirAprovacao(a) {
      const info = db.prepare('INSERT INTO aprovacoes (hora,conversa,de,para,texto,estado,tipo,dados) VALUES (?,?,?,?,?,\'pendente\',?,?)')
        .run(agora(), a.conversa, a.de, a.para, a.texto, a.tipo || 'resposta', a.dados ? JSON.stringify(a.dados) : null);
      const r = api.aprovacao(Number(info.lastInsertRowid));
      bus.emit('aprovacao', r);
      return r;
    },
    aprovacao(id) {
      return lerAprov(db.prepare('SELECT * FROM aprovacoes WHERE id=?').get(id));
    },
    pendentes() {
      return db.prepare('SELECT * FROM aprovacoes WHERE estado=\'pendente\' ORDER BY id').all().map(lerAprov);
    },
    decidir(id, estado, quem, texto) {
      const a = api.aprovacao(id);
      if (!a || a.estado !== 'pendente') return null;
      db.prepare('UPDATE aprovacoes SET estado=?, decidido_por=?, decidido_em=?, texto=? WHERE id=?')
        .run(estado, quem, agora(), texto ?? a.texto, id);
      const r = api.aprovacao(id);
      bus.emit('aprovacao', r);
      return r;
    },
    chamadasHoje() {
      const dia = agora().slice(0, 10);
      return db.prepare('SELECT COUNT(*) n FROM eventos WHERE tipo IN (\'resposta\',\'topico\') AND hora >= ?').get(dia).n;
    },
    // Respostas de agentes dentro de uma rodada (todos os ramos somados).
    respostasRodada(rodada) {
      return db.prepare('SELECT COUNT(*) n FROM eventos WHERE rodada=? AND tipo IN (\'resposta\',\'rascunho\')').get(rodada).n;
    },
    avisoNaRodada(rodada, prefixo) {
      return Boolean(db.prepare('SELECT 1 FROM eventos WHERE rodada=? AND tipo=\'sistema\' AND texto LIKE ?').get(rodada, `${prefixo}%`));
    },
    // Respostas de agentes hoje em rodadas abertas por uma pessoa (teto do convidado).
    respostasPedidasPor(pessoa) {
      const dia = agora().slice(0, 10);
      return db.prepare('SELECT COUNT(*) n FROM eventos r JOIN eventos m ON r.rodada=m.id WHERE r.tipo IN (\'resposta\',\'rascunho\') AND m.de=? AND r.hora >= ?').get(pessoa, dia).n;
    },
    eventosDaRodada(rodada) {
      return db.prepare('SELECT * FROM eventos WHERE rodada=? ORDER BY id').all(rodada).map((e) => ({ ...e, meta: e.meta ? JSON.parse(e.meta) : null }));
    },
    // Prestação de contas por agente: respostas hoje e tempo médio (meta.ms gravado em cada resposta).
    respostasHoje(agId) {
      const dia = agora().slice(0, 10);
      return db.prepare('SELECT COUNT(*) n FROM eventos WHERE tipo IN (\'resposta\',\'topico\') AND de=? AND hora >= ?').get(agId, dia).n;
    },
    medicoes(filtro = {}, limite = 50) {
      const rows = db.prepare('SELECT de, meta FROM eventos WHERE tipo=\'resposta\' AND meta LIKE \'%"ms"%\' ORDER BY id DESC LIMIT 500').all();
      return rows.map((r) => ({ de: r.de, ...JSON.parse(r.meta) }))
        .filter((m) => (!filtro.de || m.de === filtro.de) && (!filtro.motor || m.motor === filtro.motor)).slice(0, limite);
    },
    contas() {
      const dia = agora().slice(0, 10);
      const out = {};
      for (const r of db.prepare('SELECT de, hora, meta FROM eventos WHERE tipo=\'resposta\' AND meta LIKE \'%"ms"%\'').all()) {
        const m = JSON.parse(r.meta);
        const c = (out[r.de] ||= { total: 0, hoje: 0, ms: 0 });
        c.total++; c.ms += m.ms; if (r.hora >= dia) c.hoje++;
      }
      for (const c of Object.values(out)) c.mediaS = Math.round(c.ms / c.total / 100) / 10;
      return out;
    },
    stats() {
      const umaHora = new Date(Date.now() - 3600e3).toISOString();
      return {
        msgsHora: db.prepare('SELECT COUNT(*) n FROM eventos WHERE hora >= ?').get(umaHora).n,
        pendentes: db.prepare('SELECT COUNT(*) n FROM aprovacoes WHERE estado=\'pendente\'').get().n,
        chamadasHoje: api.chamadasHoje(),
      };
    },
    // v0.7: tópicos da conversa. fonte = 'sala' (agrupado pela sala, sem resumo) ou id do agente que resumiu.
    topicos(limite = 60) {
      return db.prepare('SELECT * FROM topicos ORDER BY atualizado DESC, id DESC LIMIT ?').all(limite).map(lerTopico);
    },
    topico(id) {
      return lerTopico(db.prepare('SELECT * FROM topicos WHERE id=?').get(id));
    },
    topicoDaRodada(rodada) {
      return db.prepare('SELECT * FROM topicos ORDER BY atualizado DESC, id DESC LIMIT 200').all().map(lerTopico).find((t) => t.rodadas.includes(rodada));
    },
    salvarTopico(t) {
      const j = (v) => JSON.stringify(v || []);
      if (t.id) {
        db.prepare('UPDATE topicos SET titulo=?, estado=?, resumo=?, decidido=?, pendente=?, rodadas=?, fonte=?, atualizado=? WHERE id=?')
          .run(t.titulo, t.estado, t.resumo || '', j(t.decidido), j(t.pendente), j(t.rodadas), t.fonte, agora(), t.id);
      } else {
        const info = db.prepare('INSERT INTO topicos (conversa,titulo,estado,resumo,decidido,pendente,rodadas,fonte,criado,atualizado) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(t.conversa, t.titulo, t.estado, t.resumo || '', j(t.decidido), j(t.pendente), j(t.rodadas), t.fonte, agora(), agora());
        t.id = Number(info.lastInsertRowid);
      }
      const r = api.topico(t.id);
      bus.emit('topico', r);
      return r;
    },
    fechar() { db.close(); },
  };
  return api;
}
