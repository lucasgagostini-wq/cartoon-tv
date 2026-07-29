# Cartoon TV — design aprovado (28/07/2026)

TV fake da Cartoon Network que toca os desenhos do HBO Max do Lucas como um canal linear: grade diária determinística, troca sozinha de episódio, entra no meio se "ligar" atrasado.

## Aprovações do Lucas
- Opção B (TV automática, não guia de cliques) — aprovada 28/07.
- Blocos de meia hora por série (2 segmentos de ~11min ou 1 de ~22min), séries andando em sequência entre os dias, horários variando por dia da semana com âncoras opcionais.
- "Outra Semana No Cartoon" (6 temporadas, confirmado no catálogo por print do Lucas) = intervalo entre blocos.
- "Pode seguir e criar o que precisar" — permissão ampla no PC.

## Arquitetura
- **emissora/** (VPS depois; local primeiro): catálogo JSON (séries → episódios → duração + URL), gerador de grade diária (seed = data), API `GET /agora` → { episódio, url, offsetSegundos, proximo }.
- **televisor/** (PC do Lucas): Playwright + **Chrome real instalado** (`channel: 'chrome'` — Chromium puro não tem Widevine/DRM) + perfil persistente dedicado em `televisor/.chrome-profile` (Lucas loga no Max UMA vez ali). Robô: consulta /agora, navega, seek, vigia fim/travamento/autoplay errado, troca pro próximo da grade.
- **capturador** (dentro de televisor/): usa o MESMO perfil logado; abre página de cada série e captura episódios/durações/URLs **interceptando as respostas JSON da API do app** (waitForResponse) — o DOM do Max é virtualizado e não expõe títulos como texto (verificado 28/07: tiles `PhantomTile`, aria-labels vazios).

## Séries da grade (16 + intervalo)
Dexter · Meninas Superpoderosas · Johnny Bravo · Coragem · Du Dudu e Edu · KND · Mansão Foster · Samurai Jack · Hora de Aventura · Apenas um Show · Gumball · Flapjack · Titio Avô · Clarêncio · Ben 10 clássico · Looney Tunes · **Outra Semana No Cartoon** (intervalo ~2min entre blocos).

## Adendos do Lucas (28/07, mid-sessão)
- Derivados novos (prints do Lucas confirmam no catálogo): **Apenas Um Show: As Fitas Perdidas** · **O Mundo Maravilhosamente Estranho de Gumball** (2 temporadas) · **Hora de Aventura: Terras Distantes** · **Smiling Friends**.
- **Bloco Adult Swim ~22h–02h**: Rick and Morty (OBRIGATÓRIO) + Smiling Friends (OBRIGATÓRIO) + outros Adult Swim que existirem no catálogo (verificar na captura; candidatos ⚠️ não verificados: Primal, Robot Chicken, Aqua Teen, Fionna & Cake, Harley Quinn).
- **Ben 10 Alien Force**: entra, alguns dias à noite. **Ben 10 Omniverse: NUNCA** (Lucas vetou).
- **A Turma do Bairro (KND): REMOVIDA** — Lucas conferiu no app (28/07) que a série não está no catálogo, só um filme; ele mesmo pediu pra tirar.
- Mesclar épocas na grade (clássicos + era de ouro + novos).

## Fatos verificados na sessão de 28/07
- Hub CN na conta do Lucas: `play.hbomax.com/channel/c54b70fe-7c51-4b7d-b2b5-bd94170f7a41` (aba A-Z com 304 tiles).
- Busca do Max retorna títulos como texto (get_page_text) — serve de fallback.
- Front virtualizado: scraping DOM da grade A-Z é inviável; captura via interceptação de rede.

## Riscos abertos
- ⚠️ SUPOSIÇÃO: URL estável por episódio existe (formato a descobrir na captura).
- ⚠️ SUPOSIÇÃO: Max toca vídeo normalmente sob Playwright com Chrome real + perfil persistente (testar antes de tudo).
- Update do site do Max pode quebrar seletores do robô — vigia deve falhar barulhento (notificar) e nunca clicar às cegas.

## Fora de escopo
Comerciais além do "Outra Semana", assistir fora do PC, qualquer burla de DRM. Múltiplos canais (Paramount etc.): visão de futuro do Lucas (28/07) — construir e estabilizar o canal Cartoon primeiro; o modelo já separa canal (canal-cartoon.json) de motor.

## Estado da construção (28/07, madrugada)
- **Catálogo capturado 100%**: 28 séries, ~2.300 episódios com duração/videoId/editId (emissora/catalogo/). Ambiguidades resolvidas por airDate: meninas-a=1998, ben10-a=2005 (originais na grade; reboots capturados mas fora).
- **Elenco final**: sai Robot Chicken e Aqua Teen (Lucas cortou), entram Chowder e Billy e Mandy; Maçã e Cebola fora; KND fora (só filme visível no app; API tem registro "KND" não investigado).
- **gerar-grade.js**: pronto e validado — 94 exibições/dia, faixas ok (madrugada exigiu fix de +24h), 15 intervalos "Outra Semana", determinístico.
- **tv.js**: pronto — entra no minuto certo, troca pelo relógio da grade, corrige autoplay, destrava player, mede tempo de troca.
- **vinheta.js**: sistema dinâmico CSS puro (4 variantes animadas + cartão [as] serifado na faixa 22h–02h, paleta por faixa do dia), injetado por addInitScript + payload via localStorage; cobre o carregamento da troca (gargalo estilo Pluto TV, referência do Lucas). Validado visualmente por screenshot headless.
- **Pendências**: teste ao vivo do seek/autoplay; VPS (emissora 24/7) é fase 2.

## Sessão 29/07 (madrugada)
- **Atalho de desktop**: feito (`Cartoon TV.lnk` no Desktop + Menu Iniciar → `wscript //nologo ligar-tv.vbs`, sem piscar console).
- **Tempo de troca medido em produção** (tv-log.txt, 4 sessões de 28/07): 4,1s · 4,2s · 5,3s · 7,2s · 7,7s · 8,3s · 23,6s. Mediana ~7s, a vinheta cobre.
- **Modo janela (`--app`)**: saiu o `--start-fullscreen`. A janela agora não tem abas nem barra de endereço, só a barra de título do Windows — arrasta, redimensiona e F11 leva pra tela cheia. Medido: `--app` tira 56px de UI vs janela comum (151px → 95px de altura não-conteúdo); confirmado por captura de tela da janela real. Chrome guarda tamanho/posição no perfil, então o ajuste manual do Lucas persiste. Adicionado `--disable-features=Translate` (o popup de tradução aparecia por cima do vídeo).
- **Log honesto**: fechar a janela na mão matava a operação em voo antes do evento `close`, então TODO desligamento normal era logado como "Erro no player" (3 sessões de 28/07 assim, todas falso-positivo). Agora: fechamento → `TV desligada (janela fechada)`; erro de verdade → `🔴 Erro no player`. Cada sessão abre com `=== TV ligada — <data> ===` (o log só tinha hora e os dias se misturavam). ⚠️ Um crash do Chrome cai no mesmo balde do fechamento manual — o Playwright não distingue.
