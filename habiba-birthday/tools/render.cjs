// Render the film frame-by-frame in headless Chromium.
//   node tools/render.cjs frames <outDir> [fps=30] [workers=4] [from=0] [to=TOTAL]
//   node tools/render.cjs stills <outDir> t1,t2,...
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };

function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/src/index.html`);
  await page.evaluate(() => window.ready);
  return page;
}

(async () => {
  const [mode, outDir, a1, a2, a3, a4] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  try {
    if (mode === 'stills') {
      const page = await openPage(browser, port);
      for (const s of a1.split(',')) {
        const t = parseFloat(s);
        const url = await page.evaluate((tt) => window.grabPng(tt, Math.round(tt * 30)), t);
        fs.writeFileSync(path.join(outDir, `still_${t.toFixed(2)}.png`), Buffer.from(url.split(',')[1], 'base64'));
      }
    } else {
      const fps = parseFloat(a1 || '30'), workers = parseInt(a2 || '4', 10);
      const total = await (await openPage(browser, port)).evaluate(() => window.TOTAL);
      const from = Math.round(parseFloat(a3 || '0') * fps), to = Math.round(parseFloat(a4 || String(total)) * fps);
      const t0 = Date.now();
      let done = 0;
      await Promise.all(Array.from({ length: workers }, async (_, w) => {
        const page = await openPage(browser, port);
        for (let f = from + w; f < to; f += workers) {
          const url = await page.evaluate(([tt, fi]) => window.grab(tt, fi, 0.95), [f / fps, f]);
          fs.writeFileSync(path.join(outDir, `f_${String(f).padStart(5, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
          if (++done % 100 === 0) {
            const el = (Date.now() - t0) / 1000;
            console.log(`${done}/${to - from} frames  ${(done / el).toFixed(1)} fps  eta ${((to - from - done) / (done / el)).toFixed(0)}s`);
          }
        }
      }));
      console.log(`done ${done} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  } finally {
    await browser.close();
    server.close();
  }
})();
