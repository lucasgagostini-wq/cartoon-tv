// Testa se o Widevine funciona no Chrome da TV (com o fix do component-update)
const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '.chrome-profile'), {
    channel: 'chrome', headless: false, viewport: null,
    ignoreDefaultArgs: ['--disable-component-update'],
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  // 1) O CDM Widevine existe?
  await page.goto('https://play.hbomax.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const widevine = await page.evaluate(async () => {
    try {
      await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
        initDataTypes: ['cenc'],
        videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
        audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
      }]);
      return 'DISPONIVEL';
    } catch (e) { return 'INDISPONIVEL: ' + e.message; }
  });
  console.log('Widevine: ' + widevine);

  // 2) Um episódio toca? (Apenas Um Show T1E7, id conhecido do catálogo)
  await page.goto('https://play.hbomax.com/video/watch/8e19984e-758a-4fe0-9bf3-b3417b7fdc81/0cf99ec1-c1f2-4ec8-a88b-2ea368b6b2eb', { waitUntil: 'domcontentloaded' });
  let resultado = 'NAO_TOCOU';
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) { v.muted = true; if (v.paused) v.play().catch(() => {}); }
      return v ? { t: v.currentTime, rs: v.readyState, pausado: v.paused } : null;
    }).catch(() => null);
    if (st && st.t > 1 && st.rs >= 3) { resultado = 'TOCOU em ' + (i + 1) + 's (t=' + st.t.toFixed(1) + ')'; break; }
    if (i === 89 && st) resultado = 'NAO_TOCOU (rs=' + st.rs + ' t=' + st.t + ')';
  }
  console.log('Playback: ' + resultado);
  await page.screenshot({ path: path.join(__dirname, 'teste-drm.png') });
  await ctx.close();
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1); });
