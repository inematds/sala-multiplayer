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
      return db.prepare('SELECT * FROM eventos WHERE conversa=? AND tipo IN (\'mensagem\',\'resposta\',\'resultado\',\'rascunho\') ORDER BY id DESC LIMIT ?')
        .all(conversa, limite).reverse();
    },
    pedirAprovacao(a) {
      const info = db.prepare('INSERT INTO aprovacoes (hora,conversa,de,para,texto,estado) VALUES (?,?,?,?,?,\'pendente\')')
        .run(agora(), a.conversa, a.de, a.para, a.texto);
      const r = api.aprovacao(Number(info.lastInsertRowid));
      bus.emit('aprovacao', r);
      return r;
    },
    aprovacao(id) {
      return db.prepare('SELECT * FROM aprovacoes WHERE id=?').get(id);
    },
    pendentes() {
      return db.prepare('SELECT * FROM aprovacoes WHERE estado=\'pendente\' ORDER BY id').all();
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
