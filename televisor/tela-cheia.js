// Tela cheia da janela da TV, pelo CDP — o mesmo modo do F11 (Esc não sai; F11 alterna).
//
// Por que existe (medido 15/09/2026, Chrome sob Playwright, modo --app):
// - O botão de tela cheia do player chama requestFullscreen(): o DOM entra (fullscreenElement
//   preenchido) mas a JANELA não muda de tamanho — nem pra entrar, nem pra sair. Pro Lucas,
//   "o botão não faz nada" e sobrava apertar F11.
// - Cada troca de episódio é um page.goto, que derruba o fullscreen do DOM, mas não o da janela.
// Então: a janela vai a fullscreen ao ligar, e o botão do site passa a mandar no estado da JANELA
// (entrar => fullscreen; sair => restaura o que era antes, em geral maximizada).
// Regra de ouro igual à do controle: não conhece a grade e não toca no player.

async function criarTelaCheia(ctx, page, log) {
  const cdp = await ctx.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');

  const estadoAtual = async () => (await cdp.send('Browser.getWindowBounds', { windowId })).bounds.windowState;

  // dentro=true: fullscreen. dentro=false: só sai SE estiver em fullscreen — 'normal' numa janela
  // maximizada a desmaximizaria (ex.: Lucas saiu pelo F11 e depois clicou "sair" no site).
  const definir = async (dentro) => {
    try {
      const atual = await estadoAtual();
      if (dentro && atual !== 'fullscreen') {
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
      } else if (!dentro && atual === 'fullscreen') {
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      }
    } catch (e) {
      // janela fechada no meio = desligamento normal; qualquer outra coisa vai pro log
      if (!/closed|disconnected/i.test(e.message)) log('⚠️ tela cheia: ' + e.message.split('\n')[0]);
    }
  };

  // O site avisa cada mudança do DOM; a janela segue. exposeFunction vale pra toda navegação.
  await ctx.exposeFunction('cartoontvTelaCheia', definir);
  await ctx.addInitScript(() => {
    document.addEventListener('fullscreenchange', () => {
      const dentro = !!document.fullscreenElement;
      // 250ms: se a "saída" for por navegação (page.goto), o documento morre antes e o timer
      // nunca roda — senão cada troca de episódio tiraria a TV da tela cheia.
      setTimeout(() => { if (window.cartoontvTelaCheia) window.cartoontvTelaCheia(dentro); }, 250);
    });
  });

  return { definir, estadoAtual };
}

module.exports = { criarTelaCheia };
