// Tela cheia da janela da TV, pelo CDP — o mesmo modo do F11 (Esc não sai; F11 alterna).
//
// Por que existe (medido 15/09/2026, Chrome sob Playwright, modo --app):
// - O botão de tela cheia do player chama requestFullscreen(): o DOM entra (fullscreenElement
//   preenchido) mas a JANELA não muda de tamanho — nem pra entrar, nem pra sair. Pro Lucas,
//   "o botão não faz nada" e sobrava apertar F11.
// - Cada troca de episódio é um page.goto, que derruba o fullscreen do DOM, mas não o da janela.
// Então: a janela vai a fullscreen ao ligar, e o botão do site passa a mandar no estado da JANELA.
//
// Sincronia (16/09): ao ligar e a cada troca de episódio a janela está cheia mas o DOM não, e o
// ícone do player mostra "entrar". O clique nele "entra" no DOM sem mudar nada na tela, e só o
// segundo clique saía — o Lucas apertava a tecla Windows pra alcançar a barra de tarefas. Regra:
// DOM entrou com a janela JÁ cheia = a pessoa quer SAIR (a tela já está cheia; não há outro motivo
// pra clicar). Sai da janela e tira o DOM do fullscreen também, pro ícone voltar a "entrar".
// Sair = 'normal' + 'maximized': o 'normal' sozinho devolve a janela salva no perfil (945x1012),
// e maximizada é o que ele tinha antes — com barra de tarefas à vista.
// Regra de ouro igual à do controle: não conhece a grade e não toca no player.

async function criarTelaCheia(ctx, page, log) {
  const cdp = await ctx.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');

  const estadoAtual = async () => (await cdp.send('Browser.getWindowBounds', { windowId })).bounds.windowState;
  const mudar = (windowState) => cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState } });
  const avisar = (e) => { if (!/closed|disconnected/i.test(e.message)) log('⚠️ tela cheia: ' + e.message.split('\n')[0]); };

  const entrar = async () => { if ((await estadoAtual()) !== 'fullscreen') await mudar('fullscreen'); };
  const sair = async () => {
    if ((await estadoAtual()) !== 'fullscreen') return; // 'normal' numa janela maximizada a desmaximizaria
    await mudar('normal');
    await mudar('maximized');
  };

  // O site (botão de tela cheia do player) avisa cada mudança do DOM; a janela segue.
  const aoMudarDom = async (dentro) => {
    try {
      if (!dentro) return sair();
      if ((await estadoAtual()) !== 'fullscreen') return entrar();
      // DOM fora de sincronia com a janela: o clique foi pra sair.
      await sair();
      await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : null)).catch(() => {});
    } catch (e) { avisar(e); }
  };

  await ctx.exposeFunction('cartoontvTelaCheia', aoMudarDom);
  await ctx.addInitScript(() => {
    document.addEventListener('fullscreenchange', () => {
      const dentro = !!document.fullscreenElement;
      // 250ms: se a "saída" for por navegação (page.goto), o documento morre antes e o timer
      // nunca roda — senão cada troca de episódio tiraria a TV da tela cheia.
      setTimeout(() => { if (window.cartoontvTelaCheia) window.cartoontvTelaCheia(dentro); }, 250);
    });
  });

  const definir = async (dentro) => { try { await (dentro ? entrar() : sair()); } catch (e) { avisar(e); } };
  return { definir, estadoAtual };
}

module.exports = { criarTelaCheia };
