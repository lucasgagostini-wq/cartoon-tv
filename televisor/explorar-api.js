// Explorador: abre o Max no perfil da TV, busca uma série e grava TODAS as
// respostas JSON de API em arquivos, pra descobrirmos os endpoints de catálogo.
// Uso: node explorar-api.js "hora de aventura" "C:\saida\dump"
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const query = process.argv[2] || 'hora de aventura';
const outDir = process.argv[3] || path.join(__dirname, 'api-dump');

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '.chrome-profile'), {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  let n = 0;
  page.on('response', async (res) => {
    try {
      const url = res.url();
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      if (/telegraph|amplitude|analytics|doubleclick|googletag|\/events|beacon|sentry|onetrust/i.test(url)) return;
      const body = await res.text();
      if (!body || body.length < 3) return;
      n++;
      const f = path.join(outDir, String(n).padStart(3, '0') + '.json');
      fs.writeFileSync(f, url + '\n\n' + body.slice(0, 800000));
      console.log('DUMP ' + f.split(path.sep).pop() + ' <- ' + url.slice(0, 120) + ' (' + body.length + 'b)');
    } catch (e) { /* respostas de stream fechado etc. — ignorar */ }
  });

  // Modo URL direta: se o 1º argumento começa com http, só navega e observa
  const urlDireta = /^https?:/i.test(query) ? query : null;
  await page.goto(urlDireta || 'https://play.hbomax.com/search', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Tela de escolha de perfil (se aparecer): clicar em "Lucas"
  try {
    const prof = page.getByText('Lucas', { exact: true }).first();
    if (await prof.isVisible({ timeout: 3000 })) {
      await prof.click();
      console.log('Perfil Lucas selecionado');
      await page.waitForTimeout(4000);
      if (!page.url().includes('/search')) await page.goto('https://play.hbomax.com/search', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
    }
  } catch (e) { console.log('Sem tela de perfil (' + e.message.slice(0, 60) + ')'); }

  if (!urlDireta) {
    // Digitar a busca no campo
    try {
      const box = page.getByRole('textbox').first();
      await box.click({ timeout: 8000 });
      await page.keyboard.type(query, { delay: 90 });
      console.log('Busca digitada: ' + query);
    } catch (e) { console.log('FALHA ao digitar busca: ' + e.message.slice(0, 120)); }
  }

  await page.waitForTimeout(8000);
  console.log('URL final: ' + page.url());
  console.log('Total de dumps: ' + n);
  await ctx.close();
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
