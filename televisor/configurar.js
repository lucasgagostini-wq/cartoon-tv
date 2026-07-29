// Primeira vez: abre o Chrome no streaming e espera VOCÊ fazer login e escolher o perfil.
// A sessão fica salva em televisor/.chrome-profile (nunca versionado — são seus cookies).
// Uso: node televisor/configurar.js
const { chromium } = require('playwright-core');
const path = require('path');
const readline = require('readline');
const { ler, gravar } = require('./configuracao');

const HOME = 'https://play.hbomax.com/';

const pergunta = (q) => new Promise((r) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); r(a.trim()); });
});

(async () => {
  console.log('\n=== Configuração da Cartoon TV ===\n');
  console.log('Vou abrir o Chrome no HBO Max. Faça login com a SUA conta e escolha seu perfil.');
  console.log('Quando o catálogo aparecer, volte aqui e aperte ENTER.\n');

  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(path.join(__dirname, '.chrome-profile'), {
      channel: 'chrome', headless: false, viewport: null,
      ignoreDefaultArgs: ['--disable-component-update'],   // sem isso o Widevine não registra
      args: ['--app=' + HOME, '--disable-blink-features=AutomationControlled', '--disable-features=Translate'],
    });
  } catch (e) {
    console.error('\n✗ Não consegui abrir o Chrome: ' + e.message);
    console.error('  O Google Chrome precisa estar instalado (o Chromium do Playwright não toca DRM).');
    process.exit(1);
  }

  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(HOME, { waitUntil: 'domcontentloaded' }).catch(() => {});

  await pergunta('Logado e com o perfil escolhido? ENTER pra continuar... ');

  const nome = await pergunta('Nome do seu perfil no app (ENTER pra pular): ');
  const cfg = ler();
  if (nome) cfg.perfil = nome; else delete cfg.perfil;
  cfg.configuradoEm = new Date().toISOString();
  gravar(cfg);

  // Confere que a sessão realmente ficou salva antes de dizer que deu certo
  const logado = await page.evaluate(() => {
    const t = (document.body ? document.body.innerText : '') || '';
    return !/entrar|fazer login|sign in/i.test(t.slice(0, 400));
  }).catch(() => true);

  await ctx.close().catch(() => {});

  console.log('\n' + (logado ? '✓ Pronto.' : '⚠ Não tenho certeza de que o login ficou salvo — se a TV pedir login, rode isto de novo.'));
  console.log('  Agora rode o próximo passo: capturar o catálogo (node televisor/capturar-series.js).\n');
  process.exit(0);
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
