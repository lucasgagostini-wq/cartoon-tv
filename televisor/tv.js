// A TV: abre o Chrome no HBO Max e toca a grade do dia como um canal linear.
// - Liga no programa do momento, já no minuto certo (como TV de verdade)
// - Troca de episódio pelo RELÓGIO DA GRADE (não confia no autoplay do Max)
// - Se o Max fizer autoplay pro episódio errado, corrige na hora
// - Se o player travar, recarrega e volta pro ponto
// Uso: node tv.js          (Ctrl+C ou fechar a janela = desligar)
const { chromium } = require('playwright-core');
const path = require('path');
const { gerarAte } = require('../emissora/gerar-grade');
const { INIT_SCRIPT, faixaDoMinuto } = require('./vinheta');

const TICK_MS = 5000;

function agoraInfo() {
  // Dia de programação começa 06:00; antes disso vale a grade de ontem
  const agora = new Date();
  let diaProg = new Date(agora);
  let minutos = agora.getHours() * 60 + agora.getMinutes() + agora.getSeconds() / 60;
  if (agora.getHours() < 6) { diaProg = new Date(agora.getTime() - 86400000); minutos += 24 * 60; }
  const diaStr = diaProg.getFullYear() + '-' + String(diaProg.getMonth() + 1).padStart(2, '0') + '-' + String(diaProg.getDate()).padStart(2, '0');
  return { diaStr, minutos };
}

function programaAtual() {
  const { diaStr, minutos } = agoraInfo();
  const { grade } = gerarAte(diaStr);
  for (let i = 0; i < grade.length; i++) {
    const g = grade[i];
    const fimMin = g.inicioMin + g.duracaoMs / 60000;
    if (minutos >= g.inicioMin && minutos < fimMin) {
      return { entry: g, offsetSeg: Math.max(0, Math.floor((minutos - g.inicioMin) * 60)), proximo: grade[i + 1] || null };
    }
  }
  return null;
}

const urlDe = (g) => 'https://play.hbomax.com/video/watch/' + g.videoId + '/' + g.editId;
const log = (m) => console.log('[' + new Date().toTimeString().slice(0, 8) + '] ' + m);

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '.chrome-profile'), {
    channel: 'chrome', headless: false, viewport: null,
    // ignoreDefaultArgs: sem isso o Playwright passa --disable-component-update
    // e o Widevine não registra => "Sistema DRM não compatível" (28/07)
    ignoreDefaultArgs: ['--disable-component-update'],
    // --app: janela SEM abas e SEM barra de endereço, mas ainda é janela normal do
    // Windows (arrasta, redimensiona, F11 pra tela cheia). Medido 29/07: tira 56px
    // de UI vs janela comum; sobra só a barra de título.
    // O Chrome guarda o tamanho/posição dessa janela no perfil, então o que o Lucas
    // ajustar na mão volta igual na próxima vez que ligar.
    args: [
      '--app=https://play.hbomax.com/',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=Translate', // popup de tradução aparecia por cima do vídeo
    ],
  });
  await ctx.addInitScript(INIT_SCRIPT); // vinheta cobre o carregamento de cada troca
  const page = ctx.pages()[0] || (await ctx.newPage());
  let desligada = false;
  let fimLimpo = false; // true = janela fechada; false = saiu por erro
  ctx.on('close', () => { desligada = true; fimLimpo = true; });

  // Tela de perfil na primeira carga
  await page.goto('https://play.hbomax.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  try {
    const prof = page.getByText('Lucas', { exact: true }).first();
    if (await prof.isVisible({ timeout: 2500 })) { await prof.click(); await page.waitForTimeout(3000); }
  } catch (e) { /* já entrou direto */ }

  log('=== TV ligada — ' + new Date().toLocaleDateString('pt-BR') + ' ===');
  let ligando = true;
  let ultimoVideoId = null;
  while (!desligada) {
    const prog = programaAtual();
    if (!prog) { log('Grade sem programa agora — tentando de novo em 30s'); await page.waitForTimeout(30000); continue; }
    const { entry, offsetSeg } = prog;
    const alvo = urlDe(entry);
    log('NO AR: ' + entry.slug + ' T' + entry.temporada + 'E' + entry.episodio + ' — ' + entry.nome +
      (offsetSeg > 10 ? ' (entrando aos ' + Math.floor(offsetSeg / 60) + 'min' + (offsetSeg % 60) + 's)' : ''));

    try {
      // Payload da vinheta (só quando é troca de programa de verdade, não correção)
      if (entry.videoId !== ultimoVideoId) {
        const { minutos } = agoraInfo();
        await page.evaluate((pl) => {
          try { localStorage.setItem('cartoontv_vinheta', JSON.stringify(pl)); } catch (e) {}
        }, {
          ts: Date.now(),
          tipo: ligando ? 'ligando' : (entry.intervalo ? 'intervalo' : 'a-seguir'),
          nome: entry.serie,
          sub: entry.nome + '  ·  T' + entry.temporada + ' EP ' + entry.episodio + '  ·  ' + entry.inicio,
          faixa: faixaDoMinuto(minutos),
          seed: (Date.now() ^ (entry.inicioMin * 1000)) >>> 0,
        }).catch(() => {});
      }
      ligando = false;
      ultimoVideoId = entry.videoId;
      const t0 = Date.now();
      await page.goto(alvo, { waitUntil: 'domcontentloaded' });

      // Espera o vídeo REALMENTE rodar (mede o tempo de troca) e aplica seek+som
      let rodouEm = null;
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(500);
        const ok = await page.evaluate((seg) => {
          const v = document.querySelector('video');
          if (!v) return false;
          v.muted = false; v.volume = 1;
          if (v.paused) v.play().catch(() => {});
          if (v.currentTime > 0.5 && !v.paused && v.readyState >= 3) {
            if (seg > 15 && Math.abs(v.currentTime - seg) > 20) v.currentTime = seg;
            return true;
          }
          return false;
        }, offsetSeg).catch(() => false);
        if (ok) { rodouEm = ((Date.now() - t0) / 1000).toFixed(1); break; }
      }
      if (rodouEm) {
        log('Vídeo rodando em ' + rodouEm + 's (vinheta cobriu a troca)');
      } else {
        // Diagnóstico: o que tem na tela?
        const diag = await page.evaluate(() => {
          const v = document.querySelector('video');
          return {
            url: location.href,
            temVideo: !!v,
            pausado: v ? v.paused : null,
            readyState: v ? v.readyState : null,
            erroVideo: v && v.error ? v.error.code : null,
            botoes: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').replace(/[⁦-⁩]/g, '').trim()).filter(Boolean).slice(0, 8),
            texto: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 300),
          };
        }).catch((e) => ({ falhaDiag: e.message.slice(0, 100) }));
        log('⚠️ vídeo não confirmou play em 30s — DIAG: ' + JSON.stringify(diag));
        try { await page.screenshot({ path: path.join(__dirname, 'diag-' + Date.now() + '.png') }); } catch (e) {}
      }

      // Vigia até o fim do programa (pelo relógio da grade)
      const fimEmMs = (entry.duracaoMs - offsetSeg * 1000);
      const deadline = Date.now() + Math.max(5000, fimEmMs);
      let ultimoTempo = -1, paradas = 0;
      while (!desligada && Date.now() < deadline) {
        await page.waitForTimeout(Math.min(TICK_MS, Math.max(500, deadline - Date.now())));
        // Autoplay do Max desviou pra outro vídeo? Corrige.
        if (!page.url().includes(entry.videoId)) {
          if (Date.now() >= deadline - TICK_MS) break; // fim natural, deixa trocar
          log('Autoplay desviou — voltando pro programa da grade');
          break;
        }
        // Player travado? (tempo não anda 3 checagens seguidas)
        const t = await page.evaluate(() => {
          const v = document.querySelector('video');
          return v ? { tempo: v.currentTime, pausado: v.paused } : null;
        }).catch(() => null);
        if (t && !t.pausado) {
          if (Math.abs(t.tempo - ultimoTempo) < 0.3) { paradas++; } else { paradas = 0; }
          ultimoTempo = t.tempo;
          if (paradas >= 4) { log('Player travado — recarregando'); break; }
        }
        // Prompt "ainda está assistindo?" — clica em continuar se aparecer
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')]
            .find((x) => /continuar|ainda est|keep watching|resume/i.test(x.textContent || ''));
          if (b) b.click();
        }).catch(() => {});
      }
    } catch (e) {
      // Fechar a janela na mão mata a operação em voo ANTES do evento 'close' chegar,
      // então a exceção vinha antes de `desligada` virar true e todo desligamento
      // normal aparecia no log como "Erro no player" (28/07: 3 sessões assim).
      // ⚠️ Um crash do Chrome cai no mesmo balde — o Playwright não distingue os dois.
      if (desligada || page.isClosed() || /has been closed|Target closed|browser has disconnected/i.test(e.message)) {
        desligada = true; fimLimpo = true; break;
      }
      log('🔴 Erro no player: ' + e.message.slice(0, 100) + ' — tentando de novo em 10s');
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
  log(fimLimpo ? 'TV desligada (janela fechada).' : 'TV desligada (saiu do loop sem fechamento — investigar).');
  await ctx.close().catch(() => {});
})().catch((e) => { console.error('ERRO FATAL: ' + e.message); process.exit(1); });
