// Sonda a página de uma série: acha o seletor de temporadas
const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '.chrome-profile'), {
    channel: 'chrome', headless: false, viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://play.hbomax.com/show/fff09eaf-17c3-446b-be32-8a0d47e4ccf1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  // Clique via DOM no toggle DENTRO do container do rail de episódios
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const c = document.querySelector('[data-testid="generic-show-page-rail-episodes-tabbed-content_dropdown"]');
    const b = c && (c.querySelector('[data-testid="dropdownToggleButton"]') || c.querySelector('button'));
    if (b) b.click(); else throw new Error('toggle não achado no container');
  });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    // depois de abrir: procurar QUALQUER elemento novo com "Temporada N"
    const hits = [...document.querySelectorAll('*')]
      .filter((e) => e.children.length === 0 && /^\s*Temporada \d+\s*$/.test((e.textContent || '').replace(/[⁦-⁩]/g, '')))
      .map((e) => ({
        tag: e.tagName, texto: (e.textContent || '').replace(/[⁦-⁩]/g, '').trim(),
        paiRole: e.closest('[role]') ? e.closest('[role]').getAttribute('role') : null,
        paiTestid: e.closest('[data-testid]') ? e.closest('[data-testid]').getAttribute('data-testid') : null,
      }));
    return hits.slice(0, 15);
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: require('path').join(__dirname, 'sonda-dropdown.png') });
  console.log('screenshot: sonda-dropdown.png');
  await ctx.close();
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
