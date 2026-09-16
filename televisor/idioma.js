// Idioma fixo por série: cada desenho abre no áudio/legenda que o Lucas escolheu.
//
// Por que existe (provado 16/09/2026 no player real): a escolha de faixa do HBO Max é GLOBAL da conta,
// não por série. Pôr Smiling Friends em "Inglês - Original" + legenda "Português (Brasil)" mudou o
// Rick and Morty junto, na mesma sessão. Como o Lucas quer coisas diferentes em cada desenho, a TV
// precisa reaplicar a preferência a cada troca de série.
//
// O player expõe as faixas como botões de rádio, com rótulo em português:
//   [data-testid="player-ux-audio-track-button"]  -> "Inglês - Original" | "Português (Brasil)" | "Espanhol (América Latina)"
//   [data-testid="player-ux-text-track-button"]   -> "Desativado" | "Português (Brasil)" | "Espanhol (América Latina)" | "Inglês"
//   [data-testid="player-ux-track-selector-button"] abre o menu; "...-dismiss-button" fecha.
// Regra de ouro: a decisão (o que clicar) é função pura aqui; a página só lê rótulos e clica por índice.

const PADROES = {
  pt: /portugu/i,
  en: /ingl/i,
  es: /espanhol|spanish/i,
  off: /desativad|desligad|off|nenhum/i,
};

function casa(rotulo, codigo) {
  const re = PADROES[codigo];
  return !!re && re.test(String(rotulo || ''));
}

// cfg: { padrao: {audio, legenda}, series: { <slug>: {audio, legenda} } }
function preferenciaDe(cfg, slug) {
  const base = (cfg && cfg.padrao) || {};
  const serie = (cfg && cfg.series && cfg.series[slug]) || {};
  const audio = serie.audio || base.audio || null;
  const legenda = serie.legenda || base.legenda || null;
  return audio || legenda ? { audio, legenda } : null;
}

// faixas: { audio: [{rotulo, marcada}], legenda: [...] } lidas da página.
// Devolve o índice a clicar em cada lista, ou null quando já está certo / não há opção que sirva.
function decidirCliques(faixas, pref) {
  const decidir = (lista, codigo) => {
    if (!codigo || !Array.isArray(lista) || !lista.length) return null;
    const i = lista.findIndex((f) => casa(f.rotulo, codigo));
    if (i < 0) return { idx: null, erro: 'sem faixa ' + codigo };
    if (lista[i].marcada) return null;          // já está no que o Lucas quer
    return { idx: i, rotulo: lista[i].rotulo };
  };
  return { audio: decidir(faixas.audio, pref.audio), legenda: decidir(faixas.legenda, pref.legenda) };
}

// Duas preferências iguais? (a do Max é global: se não mudou, nem abre o menu)
function mesmaPreferencia(a, b) {
  if (!a || !b) return false;
  return a.audio === b.audio && a.legenda === b.legenda;
}

// --- parte que fala com o player ---------------------------------------------------------------
// Ciclo: abre o menu e lê os rótulos -> decide no Node (função pura acima) -> clica por índice.
// Trocar uma faixa FECHA o menu, então cada clique reabre. Roda com a vinheta ainda cobrindo a troca.

const LER = async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const abrir = () => { const b = document.querySelector('[data-testid="player-ux-track-selector-button"]'); if (b) b.click(); };
  const ler = (t) => [...document.querySelectorAll('[data-testid="player-ux-' + t + '-track-button"]')]
    .map((x) => ({ rotulo: x.getAttribute('aria-label') || (x.textContent || '').trim(), marcada: x.getAttribute('aria-checked') === 'true' }));
  abrir(); await espera(1200);
  return { audio: ler('audio'), legenda: ler('text') };
};

const CLICAR = async ({ iAudio, iLegenda }) => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const abrir = () => { const b = document.querySelector('[data-testid="player-ux-track-selector-button"]'); if (b) b.click(); };
  const lista = (t) => [...document.querySelectorAll('[data-testid="player-ux-' + t + '-track-button"]')];
  const aberto = () => lista('audio').length > 0 || lista('text').length > 0;
  const clicar = async (t, i) => {
    if (i == null) return;
    if (!aberto()) { abrir(); await espera(1000); }
    const el = lista(t)[i];
    if (el) el.click();
    await espera(1000);
  };
  await clicar('audio', iAudio);
  await clicar('text', iLegenda);
  if (!aberto()) { abrir(); await espera(1000); }
  const on = (t) => lista(t).filter((x) => x.getAttribute('aria-checked') === 'true')
    .map((x) => x.getAttribute('aria-label') || (x.textContent || '').trim());
  const r = { audio: on('audio'), legenda: on('text') };
  const f = document.querySelector('[data-testid="player-ux-track-dismiss-button"]');
  if (f) f.click();
  return r;
};

// Devolve a preferência que ficou valendo (pro chamador guardar) ou null se não deu pra aplicar.
async function aplicarNoPlayer(page, pref, log) {
  if (!pref) return null;
  try {
    const faixas = await page.evaluate(LER);
    if (!faixas.audio.length && !faixas.legenda.length) {
      log('⚠️ idioma: o menu de áudio/legenda não abriu — mantido como estava');
      return null;
    }
    const d = decidirCliques(faixas, pref);
    for (const [nome, escolha] of [['áudio', d.audio], ['legenda', d.legenda]]) {
      if (escolha && escolha.idx == null) log('⚠️ idioma: este episódio não tem ' + nome + ' ' + (escolha.erro || ''));
    }
    const iAudio = d.audio && d.audio.idx != null ? d.audio.idx : null;
    const iLegenda = d.legenda && d.legenda.idx != null ? d.legenda.idx : null;
    if (iAudio == null && iLegenda == null) {
      // já estava certo: fecha o menu que a leitura abriu e não mexe em nada
      await page.evaluate(() => {
        const f = document.querySelector('[data-testid="player-ux-track-dismiss-button"]');
        if (f) f.click();
      }).catch(() => {});
      return pref;
    }
    const ficou = await page.evaluate(CLICAR, { iAudio, iLegenda });
    log('🔤 Idioma: áudio ' + (ficou.audio[0] || '?') + ' · legenda ' + (ficou.legenda[0] || '?'));
    return pref;
  } catch (e) {
    if (!/closed|disconnected/i.test(e.message)) log('⚠️ idioma: ' + e.message.split('\n')[0]);
    return null;
  }
}

module.exports = { casa, preferenciaDe, decidirCliques, mesmaPreferencia, aplicarNoPlayer, PADROES };
