# Cartoon TV

TV caseira que toca os desenhos da **minha própria assinatura do HBO Max** como um canal linear da Cartoon
Network: grade diária determinística, troca de episódio sozinha e — se você ligar atrasado — entra no meio
do programa, igual TV de verdade.

Não existe botão de "escolher episódio" na tela principal. Você liga, e o que estiver passando, está
passando.

```
06:00  Manhã dos clássicos   Dexter · Coragem · Johnny Bravo · Meninas Superpoderosas · …
12:00  Tarde era de ouro     Hora de Aventura · Apenas um Show · Gumball · Titio Avô · …
18:00  Noite de ação         Ben 10 · Samurai Jack · Looney Tunes · …
22:00  Adult Swim            Rick & Morty · Smiling Friends · Primal · Fionna e Cake
02:00  Madrugada             Coragem · Samurai Jack · Hora de Aventura · Apenas um Show
```

A cada 3 blocos entra um episódio de *Outra Semana No Cartoon* fazendo as vezes de intervalo.

## Como funciona

**`emissora/`** — o que vai ao ar.
`gerar-grade.js` é uma **função pura** de `(config, catálogo, data)`: gerar a grade do mesmo dia duas vezes
dá exatamente o mesmo resultado. A progressão dos episódios é simulada dia a dia desde a época do canal, de
modo que cada série anda em sequência entre os dias sem precisar guardar estado em lugar nenhum.

**`televisor/`** — quem assiste por você.
Um robô Playwright dirigindo o **Chrome instalado** (`channel: 'chrome'` — Chromium puro não tem Widevine)
com um perfil persistente onde você loga uma vez. Ele consulta a grade, navega até o episódio, faz o seek
pro minuto certo, e vigia: se o autoplay do serviço desviar pra outro vídeo, ele corrige; se o player
travar, recarrega e volta pro ponto.

**Vinheta.** Toda troca de episódio tem um buraco de alguns segundos enquanto o player carrega. Uma vinheta
em CSS puro (injetada por `addInitScript`) cobre esse buraco — o mesmo truque que a Pluto TV usa.

## Instalar (Windows)

1. Baixe o ZIP em **[Releases](../../releases/latest)** e extraia numa pasta qualquer.
2. Dê dois cliques em **`INSTALAR.bat`**.
3. Ele confere o Chrome, instala o Node se faltar, baixa as dependências, cria os atalhos e
   abre o Chrome pra você **entrar na sua conta**.
4. Procure **Cartoon TV** no menu Iniciar.

Ligou a TV, o controle remoto abre junto.

### O que você precisa ter

| | |
|---|---|
| **Assinatura do HBO Max** | é a **sua** conta que toca. A TV não distribui nada — ela clica no player oficial por você |
| **Google Chrome** | o navegador do Playwright não reproduz vídeo protegido; a tela ficaria preta |
| Windows | os atalhos e o `INSTALAR.bat` são de Windows. O motor é Node puro e roda em qualquer lugar, mas o empacotamento não |

O login fica **só no seu PC**, em `televisor/.chrome-profile/`, que nunca vai pro git.

### Se algum desenho não aparecer

O catálogo que vem no repo foi lido de uma conta brasileira. Disponibilidade muda por região e
plano — se faltar alguma série, apague o `.json` dela em `emissora/catalogo/` e rode
`node televisor/capturar-series.js` pra ler da sua conta.

## Rodando na mão

```bash
npm install
node televisor/configurar.js          # login (primeira vez)
node televisor/capturar-series.js     # lê o catálogo da sua conta
node emissora/gerar-grade.js          # imprime a grade de hoje
node televisor/tv.js                  # liga a TV
npm test                              # 48 testes, sem browser
```

No Windows, `ligar-tv.vbs` liga a TV sem piscar console (é o alvo do atalho).

## Estado

| | |
|---|---|
| Catálogo | 28 séries, ~2.300 episódios com duração e ID |
| Grade | 94 exibições/dia, 15 intervalos, determinística |
| Tempo de troca | mediana ~7s, coberto pela vinheta |
| Em construção | controle remoto ([spec](docs/2026-07-29-controle-remoto-design.md) · [plano](docs/2026-07-29-controle-remoto-plano.md)) |
| Fase 2 | emissora rodando 24/7 numa VPS, servindo `GET /agora` |

## Escopo

Isto é um projeto pessoal de uso próprio, em cima de uma assinatura paga. **Não contorna DRM, não baixa
vídeo, não redistribui conteúdo** e não serve nada pra fora de `127.0.0.1` — o player oficial toca o vídeo
exatamente como tocaria se você clicasse à mão. O que o projeto faz é decidir *o que* clicar e *quando*.

Os arquivos em `emissora/catalogo/` são identificadores de catálogo (título, temporada, episódio, duração),
não mídia.

## Documentação

- [`docs/2026-07-28-cartoon-tv-design.md`](docs/2026-07-28-cartoon-tv-design.md) — design da TV, decisões e pegadinhas
- [`docs/2026-07-29-controle-remoto-design.md`](docs/2026-07-29-controle-remoto-design.md) — spec do controle remoto
- [`docs/2026-07-29-controle-remoto-plano.md`](docs/2026-07-29-controle-remoto-plano.md) — plano de implementação
