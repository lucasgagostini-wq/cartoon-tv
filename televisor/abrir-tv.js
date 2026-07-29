// Abre o Chrome da TV (perfil dedicado, persistente). Uso:
//   node abrir-tv.js          -> abre no HBO Max e fica aberto (login manual na 1ª vez)
//   node abrir-tv.js <url>    -> abre direto na URL dada
// O perfil fica em televisor/.chrome-profile — logar no Max UMA vez aqui basta pra sempre.
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const url = process.argv[2] || 'https://play.hbomax.com/';
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '.chrome-profile'), {
    channel: 'chrome', // Chrome real instalado: Chromium puro não tem Widevine e o vídeo não tocaria
    headless: false,
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log('TV aberta em: ' + url);
  console.log('Perfil: ' + path.join(__dirname, '.chrome-profile'));
  // Mantém o processo vivo até a janela ser fechada
  await new Promise((resolve) => ctx.on('close', resolve));
  console.log('TV fechada.');
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
