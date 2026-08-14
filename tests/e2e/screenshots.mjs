/* Gera screenshots do app com dados de exemplo — útil para revisar o visual
   sem precisar de um projeto Supabase de verdade.

     npm run shots     # sai em ./screenshots
*/
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'screenshots');
mkdirSync(OUT, { recursive: true });
const STUB = path.join(ROOT, 'tests/e2e/supabase-stub.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let u = req.url.split('?')[0];
  if (u === '/') u = '/index.html';
  const f = u === '/vendor/supabase.js' ? STUB : path.join(ROOT, u.slice(1));
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(8125, '127.0.0.1', r));

const LOCAL_CHROMIUM = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
].filter(Boolean).find((p) => existsSync(p));
const browser = await chromium.launch(LOCAL_CHROMIUM ? { executablePath: LOCAL_CHROMIUM } : {});

function seed() {
  const entries = [];
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 1);
  let cursor = new Date(start);
  let i = 0;
  while (cursor <= today) {
    const dow = cursor.getDay();
    // trabalha ~ qui a dom, com variação
    if ([4, 5, 6, 0].includes(dow) && Math.random() > 0.22) {
      const meio = Math.random() > 0.72;
      entries.push({
        id: 'seed' + (i++),
        date: cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0'),
        turno: meio ? 'Meio' : 'Completo',
        custom: Math.random() > 0.9 ? 300 : null,
        note: '',
        updatedAt: Date.now(),
        deleted: false
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return entries;
}

async function shoot(name, { width, height, theme, tab }) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript((data) => {
    sessionStorage.setItem('__supabase_stub__', JSON.stringify({
      docs: {
        entries: { value: { v: 2, entries: data.entries }, updated_at: new Date().toISOString() },
        params: {
          value: {
            v: 2,
            params: {
              meio: 125, completoSemana: 225, completoFDS: 250, meta: 2500, metaAnual: 24000,
              metaTurnos: 20, metaDias: 18, moeda: 'BRL', idioma: 'pt-BR', tema: data.theme,
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
  }, { entries: seed(), theme });

  await page.goto('http://127.0.0.1:8125/index.html');
  await page.waitForSelector('#app-shell:visible', { timeout: 8000 });
  await page.waitForTimeout(900);
  if (tab) {
    const sel = width < 700 ? `.bn-tab[data-tab="${tab}"]` : `.tab[data-tab="${tab}"]`;
    await page.click(sel);
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: !!process.env.FULL });
  await ctx.close();
  console.log('shot:', name);
}

await shoot('01-resumo-escuro', { width: 1280, height: 1400, theme: 'escuro' });
await shoot('02-resumo-claro', { width: 1280, height: 1400, theme: 'claro' });
await shoot('03-calendario', { width: 1280, height: 900, theme: 'escuro', tab: 'calendario' });
await shoot('04-lancamentos', { width: 1280, height: 1000, theme: 'escuro', tab: 'lancamentos' });
await shoot('05-parametros', { width: 1280, height: 700, theme: 'escuro', tab: 'parametros' });
await shoot('06-objetivos', { width: 1280, height: 800, theme: 'escuro', tab: 'objetivos' });
await shoot('07-config', { width: 1280, height: 1100, theme: 'escuro', tab: 'config' });
await shoot('08-mobile', { width: 390, height: 844, theme: 'escuro' });
await shoot('09-mobile-calendario', { width: 390, height: 844, theme: 'escuro', tab: 'calendario' });

await browser.close();
server.close();
