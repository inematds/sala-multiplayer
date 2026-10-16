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
  `);
  // v0.2: aprovação pode ser de resposta (texto) ou de agente novo (dados = proposta validada).
  const colunas = db.prepare('PRAGMA table_info(aprovacoes)').all().map((c) => c.name);
  if (!colunas.includes('tipo')) db.exec("ALTER TABLE aprovacoes ADD COLUMN tipo TEXT DEFAULT 'resposta'");
  if (!colunas.includes('dados')) db.exec('ALTER TABLE aprovacoes ADD COLUMN dados TEXT');
  const lerAprov = (a) => (a ? { ...a, tipo: a.tipo || 'resposta', dados: a.dados ? JSON.parse(a.dados) : null } : a);
  const bus = new EventEmitter();
  bus.setMaxListeners(200);
  const agora = () => new Date().toISOString();

  const api = {
    bus,
    participante(p) {
      const atual = db.prepare('SELECT * FROM participantes WHERE id=?').get(p.id);
      if (atual) return atual;
      const novo = { nome: p.id, papel: '', origem: 'painel', telegram_id: null, ...p, criado: agora() };
      db.prepare('INSERT INTO participantes VALUES (?,?,?,?,?,?,?)')
        .run(novo.id, novo.nome, novo.tipo, novo.papel, novo.origem, novo.telegram_id ? String(novo.telegram_id) : null, novo.criado);
      bus.emit('participante', novo);
      return novo;
    },
    // O id do Telegram de quem é do perfil vem do .env e pode mudar entre execuções.
    definirTelegram(id, tid) {
      db.prepare('UPDATE participantes SET telegram_id=? WHERE id=?').run(tid ? String(tid) : null, id);
    },
    porTelegram(tid) {
      return db.prepare('SELECT * FROM participantes WHERE telegram_id=?').get(String(tid));
    },
    participantes() {
      return db.prepare('SELECT * FROM participantes ORDER BY tipo, nome').all();
    },
    evento(e) {
      const r = { hora: agora(), cadeia: 0, meta: null, ...e };
      const info = db.prepare('INSERT INTO eventos (hora,conversa,de,para,tipo,texto,cadeia,meta) VALUES (?,?,?,?,?,?,?,?)')
        .run(r.hora, r.conversa, r.de, r.para, r.tipo, r.texto, r.cadeia, r.meta ? JSON.stringify(r.meta) : null);
      r.id = Number(info.lastInsertRowid);
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
      return db.prepare('SELECT COUNT(*) n FROM eventos WHERE tipo=\'resposta\' AND hora >= ?').get(dia).n;
    },
    // Prestação de contas por agente: respostas hoje e tempo médio (meta.ms gravado em cada resposta).
    respostasHoje(agId) {
      const dia = agora().slice(0, 10);
      return db.prepare('SELECT COUNT(*) n FROM eventos WHERE tipo=\'resposta\' AND de=? AND hora >= ?').get(agId, dia).n;
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
    fechar() { db.close(); },
  };
  return api;
}
