// Lê o modelo de cada motor na fonte única ~/.config/inema/modelos.env (nível EXECUTOR por padrão).
// Fora da máquina do INEMA, usa as variáveis de ambiente SALA_MODELO_CLAUDE / SALA_MODELO_CODEX, ou o padrão do CLI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function lerModelos(arquivo = path.join(os.homedir(), '.config/inema/modelos.env'), nivel = 'EXECUTOR') {
  const vars = {};
  try {
    for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
      const m = linha.match(/^\s*([A-Z0-9_]+)=(.*)$/);
      if (m) vars[m[1]] = m[2].trim();
    }
  } catch { /* sem arquivo: usa ambiente/padrão */ }
  const pega = (motor) => ({
    modelo: process.env[`SALA_MODELO_${motor}`] || vars[`INEMA_${motor}_${nivel}`] || '',
    esforco: process.env[`SALA_ESFORCO_${motor}`] ?? vars[`INEMA_${motor}_${nivel}_EFFORT`] ?? '',
  });
  return { claude: pega('CLAUDE'), codex: pega('CODEX') };
}

// Todos os níveis da fonte única, por motor: { executor: { claude: {modelo, esforco}, codex: {...} }, ... }.
// O agente escolhe o nível (e, se quiser, o esforço); o nome do modelo nunca fica no código nem no perfil.
export const NIVEIS = ['super', 'topo', 'executor', 'menor'];
export function lerNiveis(arquivo) {
  return Object.fromEntries(NIVEIS.map((n) => [n, lerModelos(arquivo, n.toUpperCase())]));
}
