// Existe por um motivo só: fazer o clique no ícone abrir o PAINEL LATERAL em vez do popup.
//
// O popup do Chrome fecha sozinho quando perde o foco — péssimo pra um controle de TV, que
// você quer deixar aberto do lado enquanto assiste. O painel lateral fica fixo.
//
// Nada de relógio nem estado aqui: o service worker do MV3 morre com 30s de inatividade
// (docs do Chrome), então o ciclo da TV vive no content script, que dura o quanto a aba durar.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// onInstalled não roda quando o Chrome só religa o worker; garante o comportamento também aqui
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
