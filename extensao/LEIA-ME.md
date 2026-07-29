# Cartoon TV — extensão do Chrome

Transforma a **sua** assinatura do HBO Max num canal de TV: grade diária que troca de episódio
sozinha, entra no meio do programa se você abrir atrasado, controle remoto e playlists.

Não precisa instalar nada além da extensão. Sem programa, sem Node, sem janela extra.

## Instalar (3 passos)

1. Baixe a pasta `extensao` e deixe num lugar fixo (se ela sumir, a extensão para de funcionar).
2. No Chrome, abra **`chrome://extensions`** e ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta `extensao`.

Fixe o ícone na barra clicando na pecinha de quebra-cabeça ao lado da barra de endereço.

> **Por que não é um clique só?** O Chrome só instala extensões com um clique se elas estiverem
> publicadas na Chrome Web Store. Fora dela, este é o caminho — o mesmo que qualquer
> desenvolvedor usa. O Chrome vai mostrar um aviso de "extensões em modo de desenvolvedor";
> é normal e pode deixar aberto.

## Usar

1. Abra o **HBO Max** e faça login na sua conta.
2. Clique no ícone da Cartoon TV e depois em **▶ ligar a TV**.

Pronto. Ela pega o programa do horário e começa — no meio, se já tiver começado.

No controle você tem:

| | |
|---|---|
| **⏭ pular** | passa pro próximo |
| **↩ voltar pra grade** | sai do que você escolheu e volta pro horário |
| **∞ fila** | maratona uma série em ordem aleatória |
| **playlists** | fila que **alterna** entre várias séries |
| **▶ ver agora** | um episódio sorteado e volta pra grade |

## O que você precisa

- **Assinatura própria do HBO Max.** A extensão não distribui nada: ela clica no player oficial
  por você, na sua conta.
- **Google Chrome.**
- A aba do HBO Max **aberta** — é ela que toca. Pode deixar em outra janela ou minimizada.

## Se algo não funcionar

| sintoma | o que é |
|---|---|
| "HBO Max não está aberto" | abra `play.hbomax.com` numa aba e faça login |
| "a aba não respondeu" | recarregue a aba do HBO Max (a extensão entra junto com a página) |
| a TV não troca de episódio | a aba precisa continuar aberta; o relógio da grade vive nela |
| falta uma série | o catálogo foi lido de uma conta brasileira e a disponibilidade muda por região/plano |

## Privacidade

A extensão só roda em `play.hbomax.com`, guarda tudo no seu próprio navegador
(`chrome.storage.local`) e **não envia nada pra lugar nenhum** — não há servidor. O que ela
guarda: o que está no ar, sua playlist e o volume que você deixou.
