// Motores dos agentes: Claude Code (claude -p) e Codex (codex exec), sempre pela assinatura, nunca API.
// Cada chamada roda numa pasta vazia, sem MCP, sem ferramentas próprias do CLI e sem herdar o CLAUDE.md
// do dono: o agente só conversa e pede ferramentas da sala pelo protocolo "FERRAMENTA: nome | entrada".
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEMPO_MAX = Number(process.env.SALA_TEMPO_AGENTE_S || 240) * 1000;

function rodar(cmd, args, entrada, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGTERM'); reject(new Error(`${cmd}: passou de ${TEMPO_MAX / 1000}s`)); }, TEMPO_MAX);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} saiu com ${code}: ${err.slice(-400)}`));
    });
    p.stdin.end(entrada); // fecha o stdin: sem isso o codex fica esperando
  });
}

function pastaVazia(nome) {
  const d = path.join(os.tmpdir(), 'sala-multiplayer', nome);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export async function claude({ sistema, prompt, modelo, esforco }) {
  const args = ['-p', '--no-session-persistence', '--output-format', 'json', '--strict-mcp-config',
    '--setting-sources', 'project', '--tools', '', '--system-prompt', sistema];
  if (modelo) args.push('--model', modelo);
  if (esforco) args.push('--effort', esforco);
  const out = await rodar('claude', args, prompt, pastaVazia('claude'));
  const j = JSON.parse(out);
  if (j.is_error) throw new Error(`claude: ${String(j.result).slice(0, 300)}`);
  return String(j.result || '').trim();
}

export async function codex({ sistema, prompt, modelo, esforco }) {
  const dir = pastaVazia('codex');
  const saida = path.join(dir, `ultima-${process.pid}-${Date.now()}.txt`);
  const args = ['exec', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '-o', saida];
  if (modelo) args.push('-m', modelo);
  if (esforco) args.push('-c', `model_reasoning_effort=${esforco}`);
  args.push('-');
  await rodar('codex', args, `${sistema}\n\n${prompt}`, dir);
  const txt = fs.readFileSync(saida, 'utf8').trim();
  fs.rmSync(saida, { force: true });
  return txt;
}

// Motor falso para testes e demonstração: não chama CLI nenhum.
export async function falso({ agente, gatilho, temResultado, ferramentas }) {
  const t = gatilho.texto;
  const outro = t.match(/eco-laco @(\w+)/);
  if (outro) return `@${outro[1]} eco-laco @${agente.id}`;
  if (ferramentas.length && !temResultado && !/sem ferramenta/i.test(t)) return `FERRAMENTA: ${ferramentas[0]} | ${t}`;
  return `[${agente.nome}] recebi: ${t.slice(0, 80)}`;
}
