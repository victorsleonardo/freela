/* dev-only: gera PDF e XLSX de exemplo para inspeção visual manual.
   node tests/e2e/export-check.mjs */
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STUB = path.join(ROOT, 'tests/e2e/supabase-stub.js');
const OUT = path.join(ROOT, 'tmp-export-check');
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let u = req.url.split('?')[0];
  if (u === '/') u = '/index.html';
  const f = u === '/vendor/supabase.js' ? STUB : path.join(ROOT, u.slice(1));
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(8126, '127.0.0.1', r));

const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const browser = await chromium.launch(existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {});

function seed() {
  const entries = [];
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 1);
  const cursor = new Date(start);
  let i = 0;
  while (cursor <= today) {
    const dow = cursor.getDay();
    if ([4, 5, 6, 0].includes(dow) && Math.random() > 0.22) {
      const meio = Math.random() > 0.72;
      entries.push({
        id: 'seed' + (i++),
        date: cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0'),
        turno: meio ? 'Meio' : 'Completo',
        custom: Math.random() > 0.9 ? 300 : null,
        note: Math.random() > 0.85 ? 'Evento especial' : '',
        updatedAt: Date.now(),
        deleted: false
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return entries;
}

const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 1400 } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

await page.addInitScript((entries) => {
  sessionStorage.setItem('__supabase_stub__', JSON.stringify({
    docs: {
      entries: { value: { v: 2, entries }, updated_at: new Date().toISOString() },
      params: {
        value: {
          v: 2,
          params: {
            meio: 125, completoSemana: 225, completoFDS: 250, meta: 2500, metaAnual: 24000,
            metaTurnos: 20, metaDias: 18, moeda: 'BRL', idioma: 'pt-BR', tema: 'escuro',
            exportAuto: false, diasFDS: [5, 6]
          },
          updatedAt: Date.now()
        },
        updated_at: new Date().toISOString()
      }
    },
    session: { user: { id: 'u1', email: 'voce@email.com' } },
    failAll: false, failNext: 0, reads: 0, writes: 0
  }));
  localStorage.setItem('freelancer_supabase_url', 'https://demo.supabase.co');
  localStorage.setItem('freelancer_supabase_key', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.x');
  window.print = () => { window.__printed = true; };
}, seed());

await page.goto('http://127.0.0.1:8126/index.html');
await page.waitForSelector('#app-shell:visible', { timeout: 8000 });
await page.waitForTimeout(800);
await page.click('.tab[data-tab="config"]');
await page.waitForTimeout(300);

/* ------------------------------------------------------------------ PDF */
await page.click('#btn-export-pdf');
await page.waitForFunction(() => window.__printed === true, null, { timeout: 5000 });
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(300);

await page.pdf({
  path: path.join(OUT, 'relatorio.pdf'),
  format: 'A4',
  margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
  printBackground: true
});
console.log('PDF salvo em', path.join(OUT, 'relatorio.pdf'));

await page.screenshot({ path: path.join(OUT, 'print-report-screen.png'), fullPage: true });
await page.emulateMedia({ media: 'screen' });

/* ----------------------------------------------------------------- XLSX */
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.click('#btn-export-excel')
]);
const xlsxPath = path.join(OUT, 'relatorio.xlsx');
await download.saveAs(xlsxPath);
console.log('XLSX salvo em', xlsxPath);

await context.close();
await browser.close();
server.close();
