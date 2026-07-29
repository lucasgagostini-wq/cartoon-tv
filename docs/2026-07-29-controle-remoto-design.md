# Controle remoto da Cartoon TV — design aprovado (29/07/2026)

Janelinha separada, estilo console, que mostra o que está no ar, a grade a seguir com horários e
quanto falta pra terminar, e deixa trocar de desenho. Mais a correção do volume que abria sempre no máximo.

Complementa `2026-07-28-cartoon-tv-design.md` (a TV em si). Não substitui.

## Aprovações do Lucas (29/07, madrugada)

- **Arquitetura A**: servidor HTTP local dentro do `tv.js` + janelinha Chrome em modo `--app`.
- **Zapping**: os dois botões — `▶ ver agora` (toca um e volta pra grade) e `∞ fila aleatória` (fica na série).
- **Fila aleatória** = shuffle de playlist: sorteia sem repetir até esgotar a série, não sorteio puro.
- **Volume**: a TV lembra o volume que o Lucas deixou e para de sobrescrever. Sem slider na janelinha.
- **Visual**: estrutura TUI (painéis com borda, monoespaçada) + paleta verde de tubo **sóbria, sem glow**
  (opção A do protótipo `proto-controle-verde.html`).

## Princípio que manda em tudo

`gerarAte()` (`emissora/gerar-grade.js:139`) é **função pura** de (config, catálogo, data) — a grade de um dia
é sempre a mesma. **Nada que o Lucas clicar pode gravar na grade.** A escolha vive numa camada de override
em memória, por cima. Consequência prática: se ele esquecer a TV em qualquer modo, `↩ voltar pra grade`
sempre reconstrói o estado correto.

## Módulos

| arquivo | responsabilidade | depende de |
|---|---|---|
| `emissora/gerar-grade.js` | **não muda** | — |
| `televisor/fila.js` 🆕 | lógica pura: dado (grade, hora, override) → que episódio deve tocar. Contém o shuffle | nada |
| `televisor/controle-servidor.js` 🆕 | HTTP em `127.0.0.1:4599`. Recebe `{obterEstado, enviarComando}` | nada |
| `televisor/controle.html` 🆕 | a janelinha | nada |
| `televisor/tv.js` ✏️ | consulta o `fila.js`, sobe o servidor, corrige o volume | os três acima |
| `abrir-controle.vbs` 🆕 + atalho | abre a janelinha; liga a TV antes, se estiver desligada | — |

Nenhum módulo novo importa Playwright. `fila.js` e `controle-servidor.js` rodam e são testados sem browser.

## Regra de ouro do servidor

**O servidor HTTP nunca fala com o Playwright.** Ele só lê um snapshot que o `tv.js` mantém atualizado.

Motivo: `/estado` é chamado 1×/segundo. Se cada chamada disparasse um `page.evaluate`, uma janelinha aberta
viraria 1 chamada/s em cima do player, e um travamento do Chrome derrubaria o controle junto. Com snapshot,
a janelinha responde instantâneo e **a TV nunca cai por causa do controle**.

O `decorridoSeg` é interpolado: o vigia (que já roda de 5 em 5s) grava `{currentTime, timestamp}`, e o
`/estado` soma o tempo passado desde a última leitura. Precisão suficiente para uma barra de progresso.

## Contrato da API

```
GET  /series   → [ { slug, nome, eps } ]          // buscado uma vez ao abrir; muda só se o catálogo mudar
GET  /estado   → ver abaixo                        // poll de 1s, ~2 KB
POST /comando  → { tipo, slug? }  →  200 {ok:true} | 400 {erro}
```

```jsonc
// GET /estado
{
  "ligada": true,
  "origem": "grade",              // "grade" | "zap" | "fila"
  "fila": null,                   // quando origem="fila": { "serie": "Dexter", "restantes": 12 }
  "agora": {
    "serie": "Rick & Morty", "nome": "A Revolta dos Meeseeks",
    "temporada": 1, "episodio": 5, "inicio": "01:16",
    "duracaoSeg": 1260, "decorridoSeg": 284, "restanteSeg": 976
  },
  "aSeguir": [ { "hora": "01:37", "serie": "Primal", "te": "T1E5", "intervalo": false } ]
}
```

`tipo` aceita: `ver-agora` (exige `slug`) · `fila` (exige `slug`) · `pular` · `voltar-grade`.

**Latência:** o `POST /comando` resolve uma Promise que o loop do `tv.js` está aguardando dentro de um
`Promise.race([tick, comandoPendente])`. Troca em **menos de 1s**. Sem isso o clique ficaria preso até 5s
no `waitForTimeout` do vigia — inaceitável pra um controle remoto.

## Comportamento de cada comando

| comando | o que toca | quando acaba |
|---|---|---|
| `ver-agora` | um episódio sorteado da série, do início | volta pra grade — entra no meio do que estiver passando naquele horário |
| `fila` | episódio sorteado da série, do início | emenda o próximo do shuffle; só sai com `voltar-grade` |
| `pular` | **depende de onde você está**: na grade → próximo item da grade, do início; na fila → próximo sorteado da fila; no zap → volta pra grade na hora | volta pra grade (ou segue a fila) |
| `voltar-grade` | o que a grade manda naquele minuto, no offset certo | — |

**Decisão declarada:** `pular` antecipa o próximo item da grade e o toca desde o início. Isso deixa a TV
temporariamente adiantada em relação ao relógio — é o preço de poder pular, e reusa o mesmo mecanismo de
override em vez de inventar um segundo caminho.

**`ver-agora` sorteia** (não pega o próximo em sequência) por dois motivos: fica coerente com a fila
aleatória que o Lucas pediu, e não consome o ponteiro de sequência que a grade usa pra andar entre os dias.

**Quando `origem="fila"`, o painel `A SEGUIR` mostra a fila sorteada**, não a grade. A janelinha nunca
mostra uma coisa e toca outra.

**Só existe um override por vez.** Pedir `ver-agora` ou `fila` estando em qualquer modo substitui o
anterior — nunca empilha. Não há histórico nem "voltar pro anterior": o único caminho de volta é a grade.

O override vive **em memória**: desligou a TV, voltou a ser TV.

## O fix do volume

Causa (`televisor/tv.js:98`): a cada troca o robô roda `v.muted = false; v.volume = 1`, forçando 100% direto
no elemento `<video>`. Como não passa pelo controle do Max, a HUD continua exibindo o valor antigo — daí a
sensação de dessincronia.

Correção:

1. Sai o `v.volume = 1`.
2. `televisor/preferencias.json` guarda `{ "volume": 0.35 }`.
3. O vigia (tick de 5s, já existe) lê `v.volume`; se mudou mais de 0,01 em relação ao salvo, grava. É assim
   que a TV **aprende** o volume quando o Lucas mexe no controle do Max.
4. Na troca, aplica o salvo. **Sem arquivo salvo, não mexe em nada** — só `muted = false`.

O Lucas continua usando o controle do próprio Max; ele só para de ser sobrescrito.

## Erros

| situação | comportamento |
|---|---|
| porta 4599 ocupada (`EADDRINUSE`) | loga `⚠️ controle indisponível` e **a TV segue normalmente** |
| janelinha aberta com a TV desligada | o `.vbs` detecta (`GET /estado` falha), roda o `ligar-tv.vbs` e espera |
| `slug` inexistente ou série sem episódio válido | 400; a janelinha avisa e **não mexe no que está no ar** |
| Chrome travado / página fechada | o `/estado` devolve `ligada: false`; a janelinha mostra "TV desligada" |

O servidor escuta **só em `127.0.0.1`** — nunca `0.0.0.0`. Nada exposto na rede.

## Visual (tema A — verde de tubo sóbrio)

Referência viva: `docs/proto-controle-verde.html`, coluna A.

```
fundo        #0C110E     texto corpo    #9DB3A6     verde claro   #35E070
painel/borda #1E2B22     texto forte    #C2D6C8     verde apagado #4F9A68
botão fundo  #121A15     texto fraco    #66806F     trilha barra  #1D3325
                         nome da série  #E8FFF0
```

Fonte Consolas. Sem glow, sem scanlines. Hierarquia do verde — é ela que evita virar sopa verde:

- **verde claro** → relógio, barra de progresso, "faltam Xmin", hover
- **verde apagado** → cabeçalhos (`NO AR`, `A SEGUIR`) e os horários da lista
- **branco esverdeado** → só o nome da série no ar

Janela de 380×~600, aberta em modo `--app` com perfil próprio (`televisor/.chrome-controle`) — **não** o
perfil do Max, que está em uso pelo Playwright. O Chrome memoriza tamanho e posição nesse perfil.

## Como testar

1. `node fila.js --teste` — casos de zap, fila aleatória (sem repetição até esgotar), pular e voltar pra
   grade. Sem browser.
2. `node controle-servidor.js --mock` — serve um `/estado` falso pra ajustar a UI com a TV desligada.
3. Ao vivo: ligar a TV, abrir o controle, clicar em cada botão e conferir o `tv-log.txt`.
4. Volume: ajustar no Max, forçar uma troca pelo controle, confirmar que voltou no mesmo nível.

## Fora de escopo

Slider de volume na janelinha · controle pelo celular · agendar programa pra um horário futuro · editar a
grade pela interface · múltiplos canais. A fase 2 (emissora 24/7 na VPS) continua valendo — e a API
`/estado` desenhada aqui é exatamente a que a emissora vai expor lá.
