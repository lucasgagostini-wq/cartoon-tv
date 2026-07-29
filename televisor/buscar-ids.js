// Busca cada título no Max e coleta os shows retornados pela API de busca.
// Saída: emissora/ids-busca.json  { "query": [{id, name}, ...], ... }
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const QUERIES = [
  'laboratorio de dexter', 'meninas superpoderosas', 'johnny bravo',
  'coragem o cao covarde', 'du dudu e edu', 'a turma do bairro',
  'a mansao foster', 'samurai jack', 'hora de aventura', 'apenas um show',
  'o incrivel mundo de gumball', 'flapjack', 'titio avo', 'clarencio',
  'ben 10', 'looney tunes', 'outra semana no cartoon', 'rick and morty',
  'smiling friends', 'fitas perdidas', 'mundo maravilhosamente estranho',
  'terras distantes', 'fionna e cake', 'diamantes e limoes',
  'primal', 'robot chicken', 'aqua teen',
];
const OUT = path.join(__dirname, '..', 'emissora', 'ids-busca.json');

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '.chrome-profile'), {
    channel: 'chrome', headless: false, viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  let baldeAtual = null; // recebe shows da query em andamento
  page.on('response', async (res) => {
    try {
      if (!res.url().includes('/cms/routes/search/result')) return;
      const j = await res.json();
      for (const e of j.included || []) {
        if (e.type === 'show' && baldeAtual && !baldeAtual.some((s) => s.id === e.id)) {
          baldeAtual.push({ id: e.id, name: (e.attributes || {}).name || '' });
        }
      }
    } catch (e) { /* ignora */ }
  });

  // 1ª carga: tela de perfil se houver
  await page.goto('https://play.hbomax.com/search', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  try {
    const prof = page.getByText('Lucas', { exact: true }).first();
    if (await prof.isVisible({ timeout: 2500 })) { await prof.click(); await page.waitForTimeout(4000); }
  } catch (e) { /* sem tela de perfil */ }

  const resultado = {};
  for (const q of QUERIES) {
    baldeAtual = resultado[q] = [];
    try {
      await page.goto('https://play.hbomax.com/search', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const box = page.getByRole('textbox').first();
      await box.click({ timeout: 8000 });
      await page.keyboard.type(q, { delay: 70 });
      await page.waitForTimeout(6000);
      console.log(q + ' -> ' + resultado[q].length + ' shows');
    } catch (e) {
      console.log(q + ' -> ERRO: ' + e.message.slice(0, 100));
    }
  }
  baldeAtual = null;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(resultado, null, 2));
  console.log('Salvo em ' + OUT);
  await ctx.close();
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
