// Confere as três telas num servidor já rodando: rolagem horizontal (360–1920), erros de console,
// e tira um print de cada uma. Uso:
//   NODE_PATH=~/.npm-global/lib/node_modules node tools/checar.cjs [http://127.0.0.1:4601] [pasta-dos-prints]
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:4601';
  const saida = process.argv[3] || path.resolve(__dirname, '..', 'docs');
  const browser = await chromium.launch();
  let erros = 0;
  for (const w of [360, 800, 1280, 1920]) {
    const page = await browser.newPage({ viewport: { width: w, height: w < 600 ? 800 : 900 } });
    const cons = [];
    page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text()); });
    page.on('pageerror', (e) => cons.push(e.message));
    for (const rota of ['/', '/grafo', '/fluxo']) {
      await page.goto(base + rota);
      await page.waitForTimeout(1200);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 1) { console.log(`${rota} @${w}: rolagem horizontal ${over}px`); erros++; }
      if (w === 1280 || w === 360) await page.screenshot({ path: path.join(saida, `${rota === '/' ? 'sala' : rota.slice(1)}-${w}.png`) });
    }
    if (cons.length) { console.log(`@${w} console:`, cons.slice(0, 5)); erros += cons.length; }
    await page.close();
  }
  await browser.close();
  console.log(erros ? `FALHOU: ${erros} problema(s)` : 'OK: nenhum problema');
  process.exit(erros ? 1 : 0);
})();
