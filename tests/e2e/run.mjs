/* Testes de navegador de verdade: sobe um servidor estático, troca o
 * supabase-js pelo dublê de tests/e2e/supabase-stub.js e dirige o Chromium.
 *
 *   npm run test:e2e
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/* O ambiente traz o Chromium pré-instalado numa build que pode não ser a que
   este Playwright baixaria. Se existir, usamos o binário local. */
const LOCAL_CHROMIUM = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
].filter(Boolean).find((p) => existsSync(p));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const STUB = path.join(ROOT, 'tests/e2e/supabase-stub.js');
const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    // O app pede vendor/supabase.js; entregamos o dublê no lugar. Assim o
    // service worker cacheia o mesmo arquivo e o teste offline continua válido.
    const file = urlPath === '/vendor/supabase.js'
      ? STUB
      : path.join(ROOT, urlPath.replace(/^\/+/, ''));

    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/'
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

/* -------------------------------------------------------------------------- */

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL ${name}\n       ${err && err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'asserção falhou');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'valores diferentes'}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

/* -------------------------------------------------------------------------- */

async function connectAndLogin(page) {
  await page.fill('#cfg-url', 'https://demo.supabase.co');
  await page.fill('#cfg-key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.x');
  await page.click('#btn-connect');
  await page.waitForSelector('#gate-auth:visible', { timeout: 5000 });
  await page.fill('#auth-email', 'teste@exemplo.com');
  await page.fill('#auth-pass', 'senha123');
  await page.click('#btn-auth-submit');
  await page.waitForSelector('#app-shell:visible', { timeout: 5000 });
  await page.waitForSelector('#stat-grid .stat-card', { timeout: 5000 });
}

async function addEntry(page, { date, turno = 'Completo', custom = '', note = '' }) {
  await page.click('.tab[data-tab="lancamentos"]');
  await page.fill('#in-data', date);
  await page.selectOption('#in-turno', turno);
  if (custom !== '') await page.fill('#in-custom', String(custom));
  if (note !== '') await page.fill('#in-note', note);
  await page.click('#btn-add');
  await page.waitForFunction(
    (d) => !!document.querySelector(`#entries-list .entry-row`),
    date,
    { timeout: 5000 }
  );
}

/* -------------------------------------------------------------------------- */

async function main() {
  const server = await startServer();
  const browser = await chromium.launch(
    LOCAL_CHROMIUM ? { executablePath: LOCAL_CHROMIUM } : {}
  );
  console.log('\nE2E — Painel de Ganhos\n');

  /* ---------------------------------------------------------------- fluxo */
  {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(BASE + '/index.html');

    await check('abre na tela de conexão', async () => {
      await page.waitForSelector('#gate-connect:visible', { timeout: 5000 });
    });

    await check('recusa a chave service_role', async () => {
      // {"role":"service_role"} em base64url
      await page.fill('#cfg-url', 'https://demo.supabase.co');
      await page.fill('#cfg-key', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x');
      await page.click('#btn-connect');
      const err = await page.textContent('#connect-error');
      assert(/service_role/i.test(err), 'esperava aviso sobre service_role, veio: ' + err);
    });

    await check('recusa URL malformada', async () => {
      await page.fill('#cfg-url', 'nao-e-url');
      await page.fill('#cfg-key', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.x');
      await page.click('#btn-connect');
      const err = await page.textContent('#connect-error');
      assert(err.length > 0 && /https/i.test(err), 'esperava aviso de URL, veio: ' + err);
    });

    await check('conecta e entra na conta', async () => {
      await connectAndLogin(page);
      assertEqual(await page.textContent('#account-email'), 'teste@exemplo.com');
    });

    await check('lança um turno e vê na lista e no total', async () => {
      await addEntry(page, { date: '2025-03-05', custom: '250', note: 'evento' });
      const rows = await page.locator('#entries-list .entry-row').count();
      assertEqual(rows, 1, 'esperava 1 linha');
      const total = await page.textContent('#stat-grid .stat-card.hero .value');
      assert(total.includes('250'), 'total deveria mostrar 250, veio: ' + total);
    });

    await check('gravou no servidor no formato v2', async () => {
      const doc = await page.evaluate(() => window.__stub.getDoc('entries'));
      assert(doc && doc.v === 2, 'documento deveria ser v2');
      assertEqual(doc.entries.length, 1);
      assert(doc.entries[0].updatedAt > 0, 'entrada precisa de carimbo updatedAt');
    });

    await check('valor personalizado zero é respeitado', async () => {
      await addEntry(page, { date: '2025-03-06', custom: '0' });
      const values = await page.locator('#entries-list .entry-value').allTextContents();
      assert(values.some((v) => /0[,.]00/.test(v)), 'esperava um lançamento zerado: ' + values.join(' | '));
    });

    await check('recusa valor personalizado negativo', async () => {
      await page.fill('#in-data', '2025-03-07');
      await page.fill('#in-custom', '-10');
      await page.click('#btn-add');
      await page.waitForSelector('.dialog-backdrop', { timeout: 3000 });
      const msg = await page.textContent('.dialog-msg');
      assert(/número/i.test(msg), 'esperava aviso de valor inválido: ' + msg);
      await page.click('.dialog-ok');
      await page.fill('#in-custom', '');
    });

    await check('excluir e desfazer devolve o lançamento', async () => {
      const before = await page.locator('#entries-list .entry-row').count();
      await page.locator('#entries-list .btn-del-row').first().click();
      await page.waitForFunction(
        (n) => document.querySelectorAll('#entries-list .entry-row').length === n - 1,
        before, { timeout: 4000 }
      );
      await page.click('.toast-action');
      await page.waitForFunction(
        (n) => document.querySelectorAll('#entries-list .entry-row').length === n,
        before, { timeout: 4000 }
      );
    });

    await check('exclusão vira tombstone gravado na hora', async () => {
      await page.locator('#entries-list .btn-del-row').first().click();
      await page.waitForTimeout(400);
      const doc = await page.evaluate(() => window.__stub.getDoc('entries'));
      assert(doc.entries.some((e) => e.deleted === true), 'esperava tombstone no servidor');
    });

    await check('privacidade esconde os valores', async () => {
      await page.click('#btn-toggle-privacy');
      const total = await page.textContent('#stat-grid .stat-card.hero .value');
      assert(total.includes('••'), 'valores deveriam estar mascarados: ' + total);
      await page.click('#btn-toggle-privacy');
    });

    await check('filtro por ano não some com tudo ao digitar', async () => {
      await page.fill('#f-ano', '2');
      await page.waitForTimeout(120); // dentro da janela do debounce
      const midTyping = await page.locator('#entries-list .entry-row').count();
      assert(midTyping > 0, 'a lista não deveria esvaziar no meio da digitação');
      await page.fill('#f-ano', '2025');
      await page.waitForTimeout(450);
      assert(await page.locator('#entries-list .entry-row').count() > 0, 'esperava resultados de 2025');
      await page.click('#btn-clear-filters');
    });

    await check('troca de idioma para inglês muda a interface', async () => {
      await page.click('.tab[data-tab="config"]');
      await page.selectOption('#cfg-idioma', 'en');
      await page.click('#btn-save-config');
      await page.waitForTimeout(300);
      const tab = await page.textContent('.tab[data-tab="resumo"]');
      assertEqual(tab.trim(), 'Overview', 'a aba deveria estar em inglês');
      const monthOption = await page.locator('#f-mes option').nth(1).textContent();
      assertEqual(monthOption.trim(), 'January', 'os meses deveriam vir do Intl no locale novo');
      await page.selectOption('#cfg-idioma', 'pt-BR');
      await page.click('#btn-save-config');
      await page.waitForTimeout(300);
    });

    await check('troca de moeda reformata os valores', async () => {
      await page.selectOption('#cfg-moeda', 'USD');
      await page.click('#btn-save-config');
      await page.waitForTimeout(300);
      const total = await page.textContent('#stat-grid .stat-card.hero .value');
      assert(/US\$|\$/.test(total), 'esperava símbolo de dólar: ' + total);
      await page.selectOption('#cfg-moeda', 'BRL');
      await page.click('#btn-save-config');
      await page.waitForTimeout(300);
    });

    await check('atalho de teclado abre o lançamento rápido', async () => {
      await page.click('.tab[data-tab="resumo"]');
      await page.keyboard.press('n');
      await page.waitForSelector('#day-modal.open', { timeout: 3000 });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#day-modal').classList.contains('open'));
    });

    await check('nenhum erro de JavaScript no console', async () => {
      assertEqual(pageErrors.length, 0, 'erros: ' + pageErrors.join(' | '));
    });

    await context.close();
  }

  /* --------------------------------------------------- merge entre aparelhos */
  {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(BASE + '/index.html');
    await connectAndLogin(page);
    await addEntry(page, { date: '2025-04-01', custom: '100' });

    await check('lançamento de outro aparelho aparece sem apagar o meu', async () => {
      // Simula o outro celular gravando direto no servidor.
      await page.evaluate(() => {
        const doc = window.__stub.getDoc('entries');
        doc.entries.push({
          id: 'e-outro-aparelho',
          date: '2025-04-02',
          turno: 'Meio',
          custom: 77,
          note: '',
          updatedAt: Date.now(),
          deleted: false
        });
        window.__stub.setDoc('entries', doc);
      });

      // Voltar para a aba dispara o pull.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForFunction(
        () => document.querySelectorAll('#entries-list .entry-row').length === 2,
        null, { timeout: 5000 }
      );

      const doc = await page.evaluate(() => window.__stub.getDoc('entries'));
      const ids = doc.entries.map((e) => e.id);
      assert(ids.includes('e-outro-aparelho'), 'o lançamento do outro aparelho sumiu do servidor');
      assertEqual(doc.entries.filter((e) => !e.deleted).length, 2, 'os dois precisam sobreviver');
    });

    await check('gravação local não apaga o que o outro aparelho mandou', async () => {
      await page.evaluate(() => {
        const doc = window.__stub.getDoc('entries');
        doc.entries.push({
          id: 'e-outro-2', date: '2025-04-03', turno: 'Completo',
          custom: 55, note: '', updatedAt: Date.now(), deleted: false
        });
        window.__stub.setDoc('entries', doc);
      });
      // Sem pull antes: grava direto por cima. O merge do push tem que salvar o dia.
      await addEntry(page, { date: '2025-04-04', custom: '99' });
      await page.waitForTimeout(500);
      const doc = await page.evaluate(() => window.__stub.getDoc('entries'));
      const alive = doc.entries.filter((e) => !e.deleted).map((e) => e.date).sort();
      assertEqual(alive.length, 4, 'esperava 4 lançamentos vivos, veio ' + JSON.stringify(alive));
    });

    await context.close();
  }

  /* ------------------------------------------------------------ offline/fila */
  {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(BASE + '/index.html');
    await connectAndLogin(page);

    await check('falha de rede não perde o lançamento e mostra o aviso', async () => {
      await page.evaluate(() => window.__stub.setFailAll(true));
      await addEntry(page, { date: '2025-05-01', custom: '123' });
      await page.waitForSelector('#offline-banner.show', { timeout: 5000 });
      assertEqual(await page.locator('#entries-list .entry-row').count(), 1);

      // O cache local tem que ter guardado mesmo com a nuvem fora.
      const cached = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('freelancer_entries_v2') || '{}'));
      assert(cached.entries && cached.entries.length === 1, 'o cache local deveria ter o lançamento');
    });

    await check('quando a rede volta, a fila sobe sozinha', async () => {
      await page.evaluate(() => window.__stub.setFailAll(false));
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForFunction(() => {
        const doc = window.__stub.getDoc('entries');
        return doc && doc.entries && doc.entries.length >= 1;
      }, null, { timeout: 15000 });
      await page.waitForFunction(
        () => !document.getElementById('offline-banner').classList.contains('show'),
        null, { timeout: 15000 }
      );
    });

    await check('erro de leitura na abertura não grava vazio por cima', async () => {
      await page.evaluate(() => window.__stub.setFailAll(true));
      const writesBefore = await page.evaluate(() => window.__stub.counters().writes);
      await page.reload();
      await page.waitForTimeout(1200);
      const writesAfter = await page.evaluate(() => window.__stub.counters().writes);
      assertEqual(writesAfter, writesBefore, 'não pode haver escrita quando a leitura falhou');
      const doc = await page.evaluate(() => window.__stub.getDoc('entries'));
      assert(doc && doc.entries.length >= 1, 'o histórico do servidor tem que continuar intacto');
    });

    await context.close();
  }

  /* ----------------------------------------------------------------- XSS */
  {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    let alerted = false;
    page.on('dialog', async (d) => { alerted = true; await d.dismiss(); });
    await page.goto(BASE + '/index.html');
    await connectAndLogin(page);

    await check('dado malicioso vindo da nuvem não vira HTML', async () => {
      await page.evaluate(() => {
        window.__stub.setDoc('entries', {
          v: 2,
          entries: [{
            id: 'e-xss',
            date: '2025-06-01',
            turno: 'Completo',
            custom: 10,
            note: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1<\/script>',
            updatedAt: Date.now(),
            deleted: false
          }]
        });
      });
      await page.reload();
      await page.waitForSelector('#app-shell:visible', { timeout: 5000 });
      await page.click('.tab[data-tab="lancamentos"]');
      await page.waitForSelector('#entries-list .entry-row', { timeout: 5000 });

      const pwned = await page.evaluate(() => window.__pwned === 1);
      assert(!pwned, 'o payload executou — escape falhou');
      const injected = await page.locator('#entries-list img').count();
      assertEqual(injected, 0, 'nenhuma tag deveria ter sido criada a partir da observação');
      const noteText = await page.locator('#entries-list .entry-note').first().textContent();
      assert(noteText.includes('<img'), 'a observação deve aparecer como texto literal');
      assert(!alerted, 'não deveria abrir diálogo nativo');
    });

    await context.close();
  }

  /* ------------------------------------------------- service worker / offline */
  {
    const context = await browser.newContext(); // SW liberado aqui
    const page = await context.newPage();
    await page.goto(BASE + '/index.html');

    await check('service worker registra e assume o controle', async () => {
      await page.evaluate(() => navigator.serviceWorker.ready);
      // `controller !== null` é a única prova de que o SW está de fato
      // atendendo esta página. Sem isso, o teste offline abaixo não prova nada.
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
        null, { timeout: 10000 }
      );
    });

    await check('o shell inteiro fica em cache', async () => {
      await page.waitForTimeout(1500);
      const cached = await page.evaluate(async () => {
        const keys = await caches.keys();
        const shell = keys.find((k) => k.startsWith('painel-shell'));
        if (!shell) return [];
        const cache = await caches.open(shell);
        return (await cache.keys()).map((r) => new URL(r.url).pathname);
      });
      ['/index.html', '/assets/css/app.css', '/assets/js/main.js', '/vendor/supabase.js']
        .forEach((p) => assert(cached.includes(p), 'faltou no cache: ' + p));
    });

    await check('abre offline (a promessa que o app não cumpria)', async () => {
      await context.setOffline(true);
      await page.reload();

      // Neste contexto não há URL/chave salvas, então o boot tem que parar na
      // tela de conexão. Esperar por ela VISÍVEL prova que os módulos ES
      // rodaram — o HTML sozinho deixa as três telas com display:none.
      const visible = () =>
        page.evaluate(() => {
          const el = document.getElementById('gate-connect');
          return Boolean(el && el.offsetParent !== null);
        });

      try {
        await page.waitForFunction(
          () => {
            const el = document.getElementById('gate-connect');
            return Boolean(el && el.offsetParent !== null);
          },
          null, { timeout: 10000 }
        );
      } catch (_) {
        // Diagnóstico no próprio erro: sem isso, uma falha em CI vira adivinhação.
        const diag = await page.evaluate(() => ({
          html: document.documentElement.outerHTML.length,
          controller: navigator.serviceWorker.controller !== null,
          theme: document.documentElement.getAttribute('data-theme'),
          lang: document.documentElement.getAttribute('lang'),
          supabase: typeof window.supabase,
          bg: getComputedStyle(document.body).backgroundColor
        }));
        throw new Error('a tela de conexão não apareceu offline — ' + JSON.stringify(diag));
      }

      assert(await visible(), 'a tela de conexão deveria estar visível');

      const styled = await page.evaluate(() => {
        const bg = getComputedStyle(document.body).backgroundColor;
        return bg !== 'rgba(0, 0, 0, 0)' && bg !== '';
      });
      assert(styled, 'o CSS não veio do cache');
      assertEqual(await page.title(), 'Painel Freelancer');

      await context.setOffline(false);
    });

    await context.close();
  }

  await browser.close();
  server.close();

  console.log(`\n${passed} passaram, ${failures.length} falharam\n`);
  if (failures.length) {
    failures.forEach((f) => console.error(`✗ ${f.name}\n  ${f.err && f.err.stack}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
