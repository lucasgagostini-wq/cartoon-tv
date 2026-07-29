// A TV rodando DENTRO da página do streaming.
//
// Diferença central pro tv.js do app: lá o Playwright dirigia o navegador de fora e o
// processo vivia entre as navegações. Aqui cada navegação MATA e recria este script, então
// nada pode ficar só em memória — todo estado que precisa sobreviver vai pro chrome.storage.
//
// O relógio da grade também mora aqui, e não no service worker: o service worker do MV3
// morre com 30s de inatividade (docs do Chrome), o que arruinaria a troca no minuto certo.
// Esta aba fica aberta enquanto a TV está ligada, então o timer daqui é confiável.

const TICK_MS = 3000;
const URL_VIDEO = (v, e) => 'https://play.hbomax.com/video/watch/' + v + '/' + e;
const url = (p) => chrome.runtime.getURL(p);

let motor = null, dados = null, timer = null;

async function carregar() {
  if (motor && dados) return;
  const [fila, grade] = await Promise.all([import(url('motor/fila.js')), import(url('motor/grade.js'))]);
  motor = { ...fila, ...grade };
  const [catalogo, canal] = await Promise.all([
    fetch(url('dados/catalogo.json')).then((r) => r.json()),
    fetch(url('dados/canal.json')).then((r) => r.json()),
  ]);
  dados = { catalogo, canal };
}

// ---------- estado (sobrevive à navegação) ----------
const LIMPO = { ligada: false, override: null, consumidos: [], diaConsumidos: null, volume: null };
const lerEstado = async () => ({ ...LIMPO, ...((await chrome.storage.local.get('tv')).tv || {}) });
const gravarEstado = (e) => chrome.storage.local.set({ tv: e });

// ---------- overlay: vinheta e boot ----------
function overlay(titulo, sub) {
  let el = document.getElementById('ctv-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ctv-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:#0C110E;' +
      'display:flex;align-items:center;justify-content:center;text-align:center;' +
      "font:600 clamp(18px,3.4vw,40px)/1.35 Consolas,'Cascadia Mono',monospace;color:#35E070;letter-spacing:.2em;" +
      'transition:opacity .5s';
    (document.body || document.documentElement).appendChild(el);
    // o app troca o DOM por baixo; remonta se sumir
    new MutationObserver(() => {
      if (!document.getElementById('ctv-overlay') && el.dataset.vivo === '1') {
        (document.body || document.documentElement).appendChild(el);
      }
    }).observe(document.documentElement, { childList: true, subtree: false });
  }
  el.dataset.vivo = '1';
  el.style.opacity = '1';
  el.innerHTML = '<div>' + titulo +
    (sub ? '<div style="font-size:.4em;color:#4F9A68;letter-spacing:.28em;margin-top:1.2em">' + sub + '</div>' : '') +
    '</div>';
}
function tirarOverlay() {
  const el = document.getElementById('ctv-overlay');
  if (!el) return;
  el.dataset.vivo = '0';
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 600);
}

// ---------- player ----------
const pegarVideo = () => {
  const todos = [...document.querySelectorAll('video')];
  return todos.find((v) => !v.paused && v.currentTime > 0.5) || todos[0] || null;
};

async function ajustarPlayer(offsetSeg, volumeSalvo) {
  const v = pegarVideo();
  if (!v) return false;
  for (const el of document.querySelectorAll('video')) {
    el.muted = false;
    if (volumeSalvo != null && Math.abs(el.volume - volumeSalvo) > 0.005) el.volume = volumeSalvo;
  }
  if (v.paused) v.play().catch(() => {});
  if (v.currentTime > 0.5 && v.readyState >= 3) {
    if (offsetSeg > 15 && Math.abs(v.currentTime - offsetSeg) > 20) v.currentTime = offsetSeg;
    return true;
  }
  return false;
}

// ---------- ciclo ----------
async function decidirAgora() {
  await carregar();
  const est = await lerEstado();
  const { diaStr, minutos } = motor.agoraInfo();
  if (est.diaConsumidos !== diaStr) { est.consumidos = []; est.diaConsumidos = diaStr; }
  const grade = motor.gerarAte(diaStr, dados.canal, dados.catalogo);
  const d = motor.decidir({
    grade, minutosDia: minutos, override: est.override, agoraMs: Date.now(),
    catalogos: dados.catalogo, consumidos: new Set(est.consumidos),
  });
  if (d.origem === 'grade' && d.adiantado && d.entry) {
    const k = motor.chaveExibicao(d.entry);
    if (!est.consumidos.includes(k)) est.consumidos.push(k);
  }
  est.override = d.override;
  await gravarEstado(est);
  return { d, est, grade, minutos };
}

async function ciclo() {
  const est0 = await lerEstado();
  if (!est0.ligada) { tirarOverlay(); return; }

  const { d, est } = await decidirAgora();
  if (!d.entry) { overlay('CARTOON TV', 'sem programa agora'); return; }

  const alvo = URL_VIDEO(d.entry.videoId, d.entry.editId);
  const naPagina = location.href.includes(d.entry.videoId);

  if (!naPagina) {
    overlay((d.entry.serie || '').toUpperCase(),
      d.origem === 'grade' ? 'a seguir' : (d.origem === 'fila' ? 'fila aleatória' : 'você escolheu'));
    // navegação recria este script; o estado já está no storage
    location.href = alvo;
    return;
  }

  const pronto = await ajustarPlayer(d.offsetSeg, est.volume);
  if (pronto) {
    tirarOverlay();
    const v = pegarVideo();
    if (v && Math.abs(v.volume - (est.volume ?? -1)) > 0.01) {
      est.volume = v.volume;
      await gravarEstado(est);
    }
  } else {
    overlay((d.entry.serie || '').toUpperCase(), 'carregando');
  }

  // publica o que está no ar pro popup ler
  await chrome.storage.local.set({
    noAr: {
      ligada: true, origem: d.origem,
      fila: d.fila || null,
      serie: d.entry.serie, nome: d.entry.nome,
      temporada: d.entry.temporada, episodio: d.entry.episodio, inicio: d.entry.inicio,
      duracaoSeg: Math.round(d.entry.duracaoMs / 1000),
      decorridoSeg: Math.round(d.offsetSeg),
      atualizadoEm: Date.now(),
    },
  });
}

// ---------- comandos vindos do popup ----------
chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  (async () => {
    await carregar();
    const est = await lerEstado();
    const semente = (Date.now() ^ 0x5bf03635) >>> 0;

    if (msg.tipo === 'ligar') { est.ligada = true; }
    else if (msg.tipo === 'desligar') { est.ligada = false; est.override = null; tirarOverlay(); }
    else if (msg.tipo === 'voltar-grade') { est.override = null; }
    else if (msg.tipo === 'ver-agora' || msg.tipo === 'fila') {
      const ov = motor.criarOverride(dados.catalogo, msg.slug, msg.tipo === 'fila' ? 'fila' : 'zap', semente, Date.now());
      if (!ov) return responder({ ok: false, erro: 'série sem episódio' });
      est.override = ov;
    } else if (msg.tipo === 'playlist') {
      const validas = (msg.series || []).filter((s) => dados.catalogo[s]);
      if (!validas.length) return responder({ ok: false, erro: 'nenhuma série válida' });
      const ov = motor.criarOverride(dados.catalogo, validas, 'fila', semente, Date.now(), msg.nome || 'Playlist');
      if (!ov) return responder({ ok: false, erro: 'playlist vazia' });
      est.override = ov;
    } else if (msg.tipo === 'pular') {
      if (est.override) {
        est.override = { ...est.override, iniciadoEm: Date.now() - est.override.atual.duracaoMs - 1 };
      } else {
        const { d, grade, minutos } = await decidirAgora();
        const prox = grade.find((g) => g.inicioMin > minutos);
        if (!prox) return responder({ ok: false, erro: 'não há próximo na grade' });
        const est2 = await lerEstado();
        for (const g of [d.entry, prox].filter(Boolean)) {
          const k = motor.chaveExibicao(g);
          if (!est2.consumidos.includes(k)) est2.consumidos.push(k);
        }
        est2.override = { tipo: 'zap', slugs: [prox.slug], nome: prox.serie, seed: 0,
          atual: prox, restante: [], iniciadoEm: Date.now() };
        await gravarEstado(est2);
        responder({ ok: true });
        ciclo();
        return;
      }
    } else { return responder({ ok: false, erro: 'comando desconhecido' }); }

    await gravarEstado(est);
    responder({ ok: true });
    ciclo();
  })();
  return true;   // resposta assíncrona
});

// ---------- arranque ----------
(async () => {
  try {
    // marca de vida: dá pra confirmar que a extensão pegou nesta aba olhando o <html>,
    // sem precisar do console do content script (que roda em mundo isolado)
    document.documentElement.dataset.cartoontv = chrome.runtime.getManifest().version;
    const est = await lerEstado();
    if (est.ligada) overlay('CARTOON TV', 'ligando');
    await ciclo();
    timer = setInterval(() => ciclo().catch(() => {}), TICK_MS);
  } catch (e) {
    console.error('[Cartoon TV]', e);
  }
})();
