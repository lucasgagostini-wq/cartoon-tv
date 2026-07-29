# Controle remoto da Cartoon TV — plano de implementação

> **Para quem executa:** siga tarefa por tarefa, na ordem. Os passos usam checkbox (`- [ ]`) pra
> acompanhamento. Cada passo é uma ação de 2 a 5 minutos.

**Objetivo:** uma janelinha estilo console que mostra o que está no ar, a grade a seguir com horários e
quanto falta, e deixa trocar de desenho — mais a correção do volume que abria sempre no máximo.

**Arquitetura:** o processo da TV (`tv.js`) sobe um servidor HTTP em `127.0.0.1:4599` que serve a janelinha
e expõe `/estado` e `/comando`. A decisão de "o que tocar agora" sai do `tv.js` e vira um módulo puro
(`fila.js`), testável sem browser. O servidor nunca fala com o Playwright: lê um snapshot que o `tv.js`
mantém atualizado.

**Stack:** Node v26.4.0 (CommonJS), `playwright-core` (já instalado), `node:test` + `node:assert` nativos,
HTML/CSS/JS sem dependência. Nenhum pacote novo.

**Spec:** `docs/2026-07-29-controle-remoto-design.md`

⚠️ **Este projeto não é repositório git.** Não há passo de commit — no lugar, cada tarefa fecha com um
checkpoint executável. Se o Lucas rodar `git init` depois, os checkpoints viram commits naturalmente.

---

## Estrutura de arquivos

| arquivo | responsabilidade | tamanho previsto |
|---|---|---|
| `televisor/fila.js` 🆕 | decidir o que tocar (grade / zap / fila aleatória). Puro: sem Playwright, sem HTTP, sem relógio próprio — recebe a hora como parâmetro | ~110 linhas |
| `televisor/fila.test.js` 🆕 | testes do acima com `node:test` | ~130 linhas |
| `televisor/controle-servidor.js` 🆕 | HTTP em `127.0.0.1:4599`. Recebe callbacks; não conhece Playwright nem a grade | ~90 linhas |
| `televisor/controle.html` 🆕 | a janelinha (tema verde sóbrio) | ~230 linhas |
| `televisor/tv.js` ✏️ | passa a consultar o `fila.js`, mantém o snapshot, sobe o servidor, corrige o volume | +60 linhas |
| `televisor/preferencias.json` 🆕 | `{ "volume": 0.35 }` — criado em runtime, não versionado | — |
| `abrir-controle.vbs` 🆕 | abre a janelinha; liga a TV antes se estiver desligada | ~20 linhas |

---

## Task 1: `fila.js` — decidir o que tocar

**Files:**
- Create: `televisor/fila.js`
- Test: `televisor/fila.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Create `televisor/fila.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { decidir, criarOverride, embaralhar, entryDeEpisodio } = require('./fila');

// --- fixtures ---------------------------------------------------------------
const ep = (n, t, e, min) => ({ nome: n, temporada: t, episodio: e, duracaoMs: min * 60000,
  videoId: 'vid-' + n, editId: 'ed-' + n });

const CATALOGO = {
  dexter: { slug: 'dexter', nome: 'O Laboratório de Dexter',
    episodios: [ep('A', 1, 1, 11), ep('B', 1, 2, 11), ep('C', 1, 3, 11), ep('D', 1, 4, 11)] },
  coragem: { slug: 'coragem', nome: 'Coragem', episodios: [ep('X', 1, 1, 22)] },
};

// grade: 06:00 dexter (11min), 06:11 coragem (22min)
const GRADE = [
  { inicio: '06:00', inicioMin: 360, duracaoMs: 11 * 60000, slug: 'dexter', serie: 'O Laboratório de Dexter',
    intervalo: false, nome: 'A', temporada: 1, episodio: 1, videoId: 'g1', editId: 'g1e' },
  { inicio: '06:11', inicioMin: 371, duracaoMs: 22 * 60000, slug: 'coragem', serie: 'Coragem',
    intervalo: false, nome: 'X', temporada: 1, episodio: 1, videoId: 'g2', editId: 'g2e' },
];

const T0 = 1_000_000_000_000; // instante fixo — nada de Date.now() nos testes

// --- grade normal -----------------------------------------------------------
test('sem override, devolve o programa da grade com o offset certo', () => {
  const d = decidir({ grade: GRADE, minutosDia: 365, override: null, agoraMs: T0 });
  assert.equal(d.origem, 'grade');
  assert.equal(d.entry.slug, 'dexter');
  assert.equal(d.offsetSeg, 300);          // 5 min depois das 06:00
  assert.equal(d.proximo.slug, 'coragem');
  assert.equal(d.override, null);
});

test('sem override e fora de qualquer faixa, devolve entry nula', () => {
  const d = decidir({ grade: GRADE, minutosDia: 100, override: null, agoraMs: T0 });
  assert.equal(d.entry, null);
});

// --- zap (ver agora) --------------------------------------------------------
test('zap toca a série escolhida do início e ignora a grade', () => {
  const ov = criarOverride(CATALOGO, 'dexter', 'zap', 42, T0);
  const d = decidir({ grade: GRADE, minutosDia: 365, override: ov, agoraMs: T0 });
  assert.equal(d.origem, 'zap');
  assert.equal(d.entry.slug, 'dexter');
  assert.equal(d.offsetSeg, 0);
  assert.equal(d.fila, null);
});

test('zap devolve o offset conforme o tempo passa', () => {
  const ov = criarOverride(CATALOGO, 'dexter', 'zap', 42, T0);
  const d = decidir({ grade: GRADE, minutosDia: 367, override: ov, agoraMs: T0 + 120_000 });
  assert.equal(d.offsetSeg, 120);
});

test('quando o episódio do zap acaba, volta pra grade e o override morre', () => {
  const ov = criarOverride(CATALOGO, 'dexter', 'zap', 42, T0);
  const d = decidir({ grade: GRADE, minutosDia: 372, override: ov, agoraMs: T0 + 12 * 60000 });
  assert.equal(d.origem, 'grade');
  assert.equal(d.override, null);
  assert.equal(d.entry.slug, 'coragem');
});

// --- fila aleatória ---------------------------------------------------------
test('fila emenda o próximo sorteado quando o episódio acaba', () => {
  const ov = criarOverride(CATALOGO, 'dexter', 'fila', 42, T0);
  const primeiro = ov.atual.nome;
  const d = decidir({ grade: GRADE, minutosDia: 372, override: ov, agoraMs: T0 + 12 * 60000 });
  assert.equal(d.origem, 'fila');
  assert.notEqual(d.entry.nome, primeiro);
  assert.equal(d.offsetSeg, 0);
  assert.equal(d.fila.serie, 'O Laboratório de Dexter');
});

test('fila não repete episódio antes de esgotar a série', () => {
  let ov = criarOverride(CATALOGO, 'dexter', 'fila', 7, T0);
  const vistos = [ov.atual.nome];
  let t = T0;
  for (let i = 0; i < 3; i++) {
    t += 12 * 60000;
    const d = decidir({ grade: GRADE, minutosDia: 365, override: ov, agoraMs: t });
    ov = d.override;
    vistos.push(d.entry.nome);
  }
  assert.equal(new Set(vistos).size, 4, 'os 4 episódios deviam sair sem repetir: ' + vistos.join(','));
});

test('fila esgotada reembaralha e continua, sem voltar pra grade', () => {
  let ov = criarOverride(CATALOGO, 'dexter', 'fila', 7, T0);
  let t = T0, d;
  for (let i = 0; i < 4; i++) { t += 12 * 60000; d = decidir({ grade: GRADE, minutosDia: 365, override: ov, agoraMs: t }); ov = d.override; }
  assert.equal(d.origem, 'fila');
  assert.ok(d.entry, 'devia continuar tocando dexter');
});

test('série de um episódio só não trava a fila', () => {
  let ov = criarOverride(CATALOGO, 'coragem', 'fila', 3, T0);
  const d = decidir({ grade: GRADE, minutosDia: 365, override: ov, agoraMs: T0 + 23 * 60000 });
  assert.equal(d.origem, 'fila');
  assert.equal(d.entry.slug, 'coragem');
});

// --- utilitários ------------------------------------------------------------
test('embaralhar é determinístico por seed e preserva os itens', () => {
  const a = embaralhar([1, 2, 3, 4, 5], 99);
  const b = embaralhar([1, 2, 3, 4, 5], 99);
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5]);
});

test('criarOverride com slug inexistente devolve null', () => {
  assert.equal(criarOverride(CATALOGO, 'nao-existe', 'zap', 1, T0), null);
});

test('entryDeEpisodio produz o mesmo formato de uma entry da grade', () => {
  const e = entryDeEpisodio('dexter', 'O Laboratório de Dexter', ep('A', 1, 1, 11));
  for (const k of ['slug', 'serie', 'nome', 'temporada', 'episodio', 'duracaoMs', 'videoId', 'editId', 'intervalo']) {
    assert.ok(k in e, 'falta a chave ' + k);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --test televisor/fila.test.js
```

Esperado: falha com `Cannot find module './fila'`.

- [ ] **Step 3: Escrever o `fila.js`**

Create `televisor/fila.js`:

```js
// Decide O QUE TOCAR AGORA. Módulo puro: sem Playwright, sem HTTP, sem relógio próprio —
// a hora entra por parâmetro, por isso dá pra testar tudo sem abrir browser.
//
// override = null
//          | { tipo:'zap'|'fila', slug, serie, atual:<entry>, restante:[<ep>], iniciadoEm:<ms>, seed }
//
// Regra que manda em tudo: a GRADE NUNCA É ALTERADA (gerar-grade.js é função pura).
// O que o Lucas escolhe vive só aqui, em memória, por cima dela.

// mulberry32 — mesmo PRNG do gerar-grade.js, pra shuffle determinístico e testável
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar(arr, seed) {
  const rnd = mulberry32(seed >>> 0);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Um episódio do catálogo no MESMO formato de uma entry da grade, pro tv.js não
// precisar saber de onde veio o que está tocando.
function entryDeEpisodio(slug, nomeSerie, ep) {
  return {
    inicio: '--:--', inicioMin: null, duracaoMs: ep.duracaoMs,
    slug, serie: nomeSerie, intervalo: false,
    nome: ep.nome, temporada: ep.temporada, episodio: ep.episodio,
    videoId: ep.videoId, editId: ep.editId,
  };
}

function criarOverride(catalogos, slug, tipo, seed, agoraMs) {
  const c = catalogos[slug];
  if (!c || !c.episodios || !c.episodios.length) return null;
  const baralho = embaralhar(c.episodios, seed);
  const [primeiro, ...resto] = baralho;
  return {
    tipo, slug, serie: c.nome, seed,
    atual: entryDeEpisodio(slug, c.nome, primeiro),
    restante: resto,
    iniciadoEm: agoraMs,
  };
}

// Chamado quando o episódio corrente do override termina.
// zap  -> null (volta pra grade)
// fila -> próximo do baralho
function avancarOverride(ov, agoraMs) {
  if (!ov || ov.tipo !== 'fila') return null;
  if (!ov.restante.length) return null;
  const [prox, ...resto] = ov.restante;
  return { ...ov, atual: entryDeEpisodio(ov.slug, ov.serie, prox), restante: resto, iniciadoEm: agoraMs };
}

function programaDaGrade(grade, minutosDia) {
  for (let i = 0; i < grade.length; i++) {
    const g = grade[i];
    const fimMin = g.inicioMin + g.duracaoMs / 60000;
    if (minutosDia >= g.inicioMin && minutosDia < fimMin) {
      return { entry: g, offsetSeg: Math.max(0, Math.floor((minutosDia - g.inicioMin) * 60)), proximo: grade[i + 1] || null };
    }
  }
  return { entry: null, offsetSeg: 0, proximo: null };
}

// A única função que o tv.js chama. Devolve o override ATUALIZADO — nunca muta o que recebeu.
function decidir({ grade, minutosDia, override, agoraMs, catalogos }) {
  let ov = override;

  while (ov) {
    const decorridoMs = agoraMs - ov.iniciadoEm;
    if (decorridoMs < ov.atual.duracaoMs) break;     // ainda tocando
    ov = avancarOverride(ov, ov.iniciadoEm + ov.atual.duracaoMs, catalogos);
  }

  if (ov) {
    const offsetSeg = Math.max(0, Math.floor((agoraMs - ov.iniciadoEm) / 1000));
    return {
      entry: ov.atual, offsetSeg, origem: ov.tipo, override: ov,
      proximo: ov.tipo === 'fila' ? (ov.restante[0] || null) : null,
      fila: ov.tipo === 'fila' ? { serie: ov.serie, restantes: ov.restante.length } : null,
    };
  }

  const g = programaDaGrade(grade, minutosDia);
  return { ...g, origem: 'grade', override: null, fila: null };
}

module.exports = { decidir, criarOverride, avancarOverride, embaralhar, entryDeEpisodio, programaDaGrade };
```

⚠️ Esta primeira versão **não trata o baralho esgotado** (devolve `null`, o que jogaria a maratona de volta
pra grade). Isso é de propósito: escreva assim, rode os testes, veja exatamente quais dois falham, e só
então corrija no Step 5. É o ciclo TDD — não pule pro Step 5 antes de ver o vermelho.

- [ ] **Step 4: Rodar e ver o que passa**

```bash
node --test televisor/fila.test.js
```

Esperado: a maioria passa; **falham** `fila esgotada reembaralha e continua` e
`série de um episódio só não trava a fila`.

- [ ] **Step 5: Corrigir o reembaralhamento**

Em `televisor/fila.js`, substitua a função `avancarOverride` inteira por:

```js
function avancarOverride(ov, agoraMs, catalogos) {
  if (!ov || ov.tipo !== 'fila') return null;
  let restante = ov.restante;
  let seed = ov.seed;
  if (!restante.length) {
    // Baralho esgotado: reembaralha a série inteira com uma seed derivada e continua.
    // Sem isso a maratona morreria ao fim da série — e séries de 1 episódio nem começariam.
    const c = catalogos && catalogos[ov.slug];
    if (!c || !c.episodios.length) return null;
    seed = (ov.seed * 1664525 + 1013904223) >>> 0;
    restante = embaralhar(c.episodios, seed);
  }
  const [prox, ...resto] = restante;
  return { ...ov, seed, atual: entryDeEpisodio(ov.slug, ov.serie, prox), restante: resto, iniciadoEm: agoraMs };
}
```

E no `fila.test.js`, os dois testes de fila precisam passar o catálogo — troque as chamadas
`decidir({ grade: GRADE, minutosDia: ..., override: ov, agoraMs: ... })` por
`decidir({ grade: GRADE, minutosDia: ..., override: ov, agoraMs: ..., catalogos: CATALOGO })`
em **todos** os testes de zap e fila (o parâmetro é ignorado quando não há override).

- [ ] **Step 6: Rodar tudo verde**

```bash
node --test televisor/fila.test.js
```

Esperado: `# pass 12` e `# fail 0`.

- [ ] **Step 7: Checkpoint**

```bash
node --test televisor/
```

Esperado: todos os testes passam. Não siga pra Task 2 com teste vermelho.

---

## Task 2: `controle-servidor.js` — o HTTP

**Files:**
- Create: `televisor/controle-servidor.js`
- Test: `televisor/controle-servidor.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Create `televisor/controle-servidor.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { iniciarControle } = require('./controle-servidor');

const PORTA = 45991; // porta de teste, não a 4599 de produção

function subir(overrides = {}) {
  const comandos = [];
  const server = iniciarControle({
    porta: PORTA,
    obterEstado: () => ({ ligada: true, origem: 'grade', agora: { serie: 'Dexter' } }),
    obterSeries: () => [{ slug: 'dexter', nome: 'Dexter', eps: 78 }],
    enviarComando: (c) => { comandos.push(c); return { ok: true }; },
    ...overrides,
  });
  return { server, comandos };
}

const get = (rota) => fetch('http://127.0.0.1:' + PORTA + rota);
const post = (rota, body) => fetch('http://127.0.0.1:' + PORTA + rota,
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('GET /estado devolve o snapshot em JSON', async () => {
  const { server } = subir();
  const r = await get('/estado');
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.origem, 'grade');
  server.close();
});

test('GET /series devolve o catálogo', async () => {
  const { server } = subir();
  const j = await (await get('/series')).json();
  assert.equal(j[0].slug, 'dexter');
  server.close();
});

test('POST /comando entrega o comando e responde ok', async () => {
  const { server, comandos } = subir();
  const r = await post('/comando', { tipo: 'ver-agora', slug: 'dexter' });
  assert.equal(r.status, 200);
  assert.deepEqual(comandos[0], { tipo: 'ver-agora', slug: 'dexter' });
  server.close();
});

test('POST /comando com tipo inválido responde 400 e NÃO entrega', async () => {
  const { server, comandos } = subir();
  const r = await post('/comando', { tipo: 'explodir' });
  assert.equal(r.status, 400);
  assert.equal(comandos.length, 0);
  server.close();
});

test('POST /comando que o tv.js recusa vira 400', async () => {
  const { server } = subir({ enviarComando: () => ({ ok: false, erro: 'série sem episódio' }) });
  const r = await post('/comando', { tipo: 'fila', slug: 'x' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).erro, /sem episódio/);
  server.close();
});

test('rota desconhecida responde 404', async () => {
  const { server } = subir();
  assert.equal((await get('/nada')).status, 404);
  server.close();
});

test('porta ocupada chama aoErro em vez de derrubar o processo', async () => {
  const a = subir();
  let capturado = null;
  const b = iniciarControle({
    porta: PORTA, obterEstado: () => ({}), obterSeries: () => [], enviarComando: () => ({ ok: true }),
    aoErro: (e) => { capturado = e; },
  });
  await new Promise((r) => setTimeout(r, 250));
  assert.ok(capturado, 'aoErro devia ter sido chamado');
  assert.equal(capturado.code, 'EADDRINUSE');
  a.server.close(); b.close();
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --test televisor/controle-servidor.test.js
```

Esperado: `Cannot find module './controle-servidor'`.

- [ ] **Step 3: Escrever o servidor**

Create `televisor/controle-servidor.js`:

```js
// Servidor da janelinha de controle. Escuta SÓ em 127.0.0.1.
//
// REGRA DE OURO: este módulo não conhece Playwright, não conhece a grade e nunca toca no player.
// Ele recebe callbacks e devolve o que elas disserem. Assim /estado responde instantâneo (é leitura
// de um objeto em memória) e um travamento do Chrome não derruba o controle junto.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TIPOS_VALIDOS = new Set(['ver-agora', 'fila', 'pular', 'voltar-grade']);

function json(res, status, corpo) {
  const txt = JSON.stringify(corpo);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(txt);
}

function lerCorpo(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve(null); } });
  });
}

function iniciarControle({ porta = 4599, obterEstado, obterSeries, enviarComando, aoErro }) {
  const server = http.createServer(async (req, res) => {
    const rota = (req.url || '').split('?')[0];

    if (req.method === 'GET' && (rota === '/' || rota === '/controle.html')) {
      return fs.readFile(path.join(__dirname, 'controle.html'), (err, buf) => {
        if (err) { res.writeHead(500); return res.end('controle.html nao encontrado'); }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(buf);
      });
    }
    if (req.method === 'GET' && rota === '/estado') return json(res, 200, obterEstado());
    if (req.method === 'GET' && rota === '/series') return json(res, 200, obterSeries());

    if (req.method === 'POST' && rota === '/comando') {
      const corpo = await lerCorpo(req);
      if (!corpo || !TIPOS_VALIDOS.has(corpo.tipo)) return json(res, 400, { erro: 'comando invalido' });
      const r = enviarComando({ tipo: corpo.tipo, ...(corpo.slug ? { slug: corpo.slug } : {}) });
      return r && r.ok ? json(res, 200, { ok: true }) : json(res, 400, { erro: (r && r.erro) || 'recusado' });
    }

    json(res, 404, { erro: 'rota desconhecida' });
  });

  // Porta ocupada não pode derrubar a TV: avisa e segue sem controle.
  server.on('error', (e) => { if (aoErro) aoErro(e); else throw e; });
  server.listen(porta, '127.0.0.1');
  return server;
}

module.exports = { iniciarControle };

// Modo mock: `node controle-servidor.js --mock` sobe um /estado falso pra ajustar a UI
// com a TV desligada. Não depende de nada do resto do projeto.
if (require.main === module && process.argv.includes('--mock')) {
  const t0 = Date.now();
  iniciarControle({
    porta: 4599,
    obterEstado: () => {
      const dec = Math.floor((Date.now() - t0) / 1000) % 1260;
      return {
        ligada: true, origem: 'grade', fila: null,
        agora: { serie: 'Rick & Morty', nome: 'A Revolta dos Meeseeks', temporada: 1, episodio: 5,
          inicio: '01:16', duracaoSeg: 1260, decorridoSeg: dec, restanteSeg: 1260 - dec },
        aSeguir: [
          { hora: '01:37', serie: 'Primal', te: 'T1E5', intervalo: false },
          { hora: '01:59', serie: 'Hora de Aventura com Fionna e Cake', te: 'T1E5', intervalo: false },
          { hora: '02:24', serie: 'Outra Semana No Cartoon', te: 'T3E7', intervalo: true },
        ],
      };
    },
    obterSeries: () => ['dexter', 'coragem', 'gumball', 'titio-avo', 'primal', 'rick-e-morty']
      .map((s) => ({ slug: s, nome: s, eps: 40 })),
    enviarComando: (c) => { console.log('[mock] comando:', c); return { ok: true }; },
    aoErro: (e) => { console.error('mock:', e.message); process.exit(1); },
  });
  console.log('mock em http://127.0.0.1:4599');
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
node --test televisor/controle-servidor.test.js
```

Esperado: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Checkpoint — subir o mock**

```bash
node televisor/controle-servidor.js --mock
```

Esperado: imprime `mock em http://127.0.0.1:4599`. Em outro terminal:
`curl http://127.0.0.1:4599/estado` devolve o JSON com `decorridoSeg` crescendo. Encerre com Ctrl+C.

---

## Task 3: `controle.html` — a janelinha

**Files:**
- Create: `televisor/controle.html`
- Reference: `docs/proto-controle-verde.html` (coluna A — copie a paleta de lá, não invente)

- [ ] **Step 1: Criar o arquivo com a estrutura e o tema**

Create `televisor/controle.html`. A paleta é exatamente a da coluna A do protótipo aprovado:

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Controle · Cartoon TV</title>
<style>
  :root {
    --bg:#0C110E; --barra-bg:#141B16; --borda:#1E2B22; --borda-bt:#24332A;
    --texto:#9DB3A6; --texto-forte:#C2D6C8; --texto-fraco:#66806F;
    --titulo:#E8FFF0; --verde:#35E070; --verde-dim:#4F9A68; --trilha:#1D3325;
    --bt-bg:#121A15; --bt-hover:#17231A;
  }
  * { box-sizing: border-box; }
  body {
    margin:0; padding:12px; background:var(--bg); color:var(--texto);
    font:12px/1.45 Consolas,'Cascadia Mono','Courier New',monospace;
    user-select:none; overflow-x:hidden;
  }
  .bloco { border:1px solid var(--borda); border-radius:5px; padding:10px 11px; }
  .bloco + .bloco { margin-top:9px; }
  .cab { display:flex; align-items:center; gap:7px; margin-bottom:8px;
         font-size:10px; letter-spacing:.14em; color:var(--verde-dim); }
  .cab .linha { flex:1; height:1px; background:var(--borda); }
  .cab .relogio { color:var(--verde); letter-spacing:.04em; }
  .serie { font-size:15px; font-weight:700; color:var(--titulo); margin-bottom:2px; }
  .ep { color:var(--texto-forte); }
  .meta { font-size:11px; color:var(--texto-fraco); margin-bottom:9px; }
  .barra { height:10px; letter-spacing:-.5px; white-space:nowrap; overflow:hidden; color:var(--verde); }
  .barra .vazio { color:var(--trilha); }
  .resta { display:flex; justify-content:space-between; font-size:11px; margin-top:5px; color:var(--texto-fraco); }
  .resta b { color:var(--verde); font-weight:600; }
  .botoes,.acao { display:flex; gap:7px; margin-top:11px; }
  .bt { flex:1; text-align:center; padding:7px 0; font-size:11.5px; cursor:pointer;
        border:1px solid var(--borda-bt); border-radius:4px; background:var(--bt-bg); color:var(--texto-forte); }
  .bt:hover { background:var(--bt-hover); border-color:var(--verde); color:var(--titulo); }
  .bt[disabled] { opacity:.35; cursor:default; }
  .bt[disabled]:hover { background:var(--bt-bg); border-color:var(--borda-bt); color:var(--texto-forte); }
  .lista { display:flex; flex-direction:column; gap:1px; }
  .item { display:flex; gap:9px; padding:3px 4px; font-size:11.5px; border-radius:3px; }
  .item .h { flex:none; width:40px; color:var(--verde-dim); }
  .item .n { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .item .te { flex:none; font-size:10.5px; color:var(--texto-fraco); }
  .item.int .n { opacity:.55; font-style:italic; }
  .busca { display:flex; align-items:center; gap:6px; padding:5px 8px; font-size:11.5px; margin-bottom:8px;
           border:1px solid var(--borda-bt); border-radius:4px; background:var(--bt-bg); color:var(--verde-dim); }
  .busca input { flex:1; background:none; border:0; outline:none; font:inherit; color:var(--titulo); user-select:text; }
  .chips { display:flex; flex-wrap:wrap; gap:4px; max-height:112px; overflow-y:auto; }
  .chip { padding:3px 7px; font-size:11px; cursor:pointer;
          border:1px solid var(--borda-bt); border-radius:3px; background:var(--bt-bg); }
  .chip:hover { border-color:var(--verde); color:var(--titulo); }
  .chip.sel { border-color:var(--verde); color:var(--titulo); background:var(--bt-hover); }
  .aviso { padding:14px 4px; text-align:center; color:var(--texto-fraco); }
  .aviso b { display:block; color:var(--verde); font-size:14px; margin-bottom:5px; }
  .badge { font-size:9.5px; letter-spacing:.1em; padding:1px 5px; border:1px solid var(--verde-dim);
           border-radius:3px; color:var(--verde); }
</style>
</head>
<body>
<div id="raiz"><div class="bloco"><div class="aviso">conectando…</div></div></div>

<script>
const $ = (s, r = document) => r.querySelector(s);
let series = [], selecionado = null, filtro = '', ultimoEstado = null;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s/60) + 'min' + String(s%60).padStart(2,'0') + 's'; };

async function comando(tipo, slug) {
  try {
    const r = await fetch('/comando', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify(slug ? { tipo, slug } : { tipo }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert('recusado: ' + (j.erro || r.status)); }
    else { selecionado = null; atualizar(); }
  } catch (e) { alert('TV nao respondeu'); }
}

function pintar(e) {
  if (!e || !e.ligada || !e.agora) {
    $('#raiz').innerHTML = '<div class="bloco"><div class="aviso"><b>TV desligada</b>abra pelo atalho Cartoon TV</div></div>';
    return;
  }
  const a = e.agora;
  const pct = a.duracaoSeg ? Math.max(0, Math.min(1, a.decorridoSeg / a.duracaoSeg)) : 0;
  const cheio = Math.round(pct * 30);
  const emFila = e.origem === 'fila';
  const badge = e.origem === 'grade' ? '' :
    '<span class="badge">' + (emFila ? 'FILA · ' + esc(e.fila.serie) : 'ZAP') + '</span>';

  const listaVis = series.filter((s) => !filtro || s.nome.toLowerCase().includes(filtro) || s.slug.includes(filtro));

  $('#raiz').innerHTML = `
    <div class="bloco">
      <div class="cab">&#9679; NO AR ${badge}<span class="linha"></span><span class="relogio">${new Date().toTimeString().slice(0,8)}</span></div>
      <div class="serie">${esc(a.serie)}</div>
      <div class="ep">${esc(a.nome)}</div>
      <div class="meta">T${a.temporada} E${a.episodio} &nbsp;·&nbsp; ${e.origem === 'grade' ? 'começou ' + esc(a.inicio) : 'fora da grade'}</div>
      <div class="barra">${'█'.repeat(cheio)}<span class="vazio">${'░'.repeat(30 - cheio)}</span></div>
      <div class="resta"><span>faltam <b>${mmss(a.restanteSeg)}</b></span><span>${Math.round(pct*100)}%</span></div>
      <div class="botoes">
        <div class="bt" data-cmd="pular">&#9197; pular</div>
        <div class="bt" data-cmd="voltar-grade" ${e.origem === 'grade' ? 'disabled' : ''}>&#8617; voltar pra grade</div>
      </div>
    </div>

    <div class="bloco">
      <div class="cab">${emFila ? 'FILA ALEATÓRIA' : 'A SEGUIR'}<span class="linha"></span></div>
      <div class="lista">${(e.aSeguir || []).map((s) => `
        <div class="item ${s.intervalo ? 'int' : ''}">
          <span class="h">${esc(s.hora)}</span>
          <span class="n">${s.intervalo ? '&#9656; ' : ''}${esc(s.serie)}</span>
          <span class="te">${esc(s.te)}</span>
        </div>`).join('') || '<div class="item"><span class="n">—</span></div>'}
      </div>
    </div>

    <div class="bloco">
      <div class="cab">TROCAR PARA<span class="linha"></span></div>
      <div class="busca"><span>&#62;</span><input id="f" placeholder="filtrar série..." value="${esc(filtro)}"></div>
      <div class="chips">${listaVis.map((s) => `
        <span class="chip ${s.slug === selecionado ? 'sel' : ''}" data-slug="${esc(s.slug)}">${esc(s.nome)}</span>`).join('')}
      </div>
      <div class="acao">
        <div class="bt" data-cmd="ver-agora" ${selecionado ? '' : 'disabled'}>&#9654; ver agora</div>
        <div class="bt" data-cmd="fila" ${selecionado ? '' : 'disabled'}>&#8734; fila aleatória</div>
      </div>
    </div>`;

  const f = $('#f');
  if (f) {
    f.oninput = () => { filtro = f.value.toLowerCase(); pintar(ultimoEstado); $('#f').focus(); };
    if (filtro) { f.focus(); f.setSelectionRange(filtro.length, filtro.length); }
  }
  document.querySelectorAll('.chip').forEach((c) => {
    c.onclick = () => { selecionado = (selecionado === c.dataset.slug) ? null : c.dataset.slug; pintar(ultimoEstado); };
  });
  document.querySelectorAll('.bt[data-cmd]').forEach((b) => {
    if (b.hasAttribute('disabled')) return;
    b.onclick = () => comando(b.dataset.cmd, (b.dataset.cmd === 'ver-agora' || b.dataset.cmd === 'fila') ? selecionado : null);
  });
}

async function atualizar() {
  try {
    const e = await (await fetch('/estado')).json();
    ultimoEstado = e; pintar(e);
  } catch (err) { ultimoEstado = null; pintar(null); }
}

(async () => {
  try { series = await (await fetch('/series')).json(); } catch (e) { series = []; }
  atualizar();
  setInterval(atualizar, 1000);
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Ver a janelinha contra o mock**

```bash
node televisor/controle-servidor.js --mock
```

Abra `http://127.0.0.1:4599` no navegador. Esperado: a janelinha do tema verde, com a barra andando,
"faltam Xmin", os 6 chips de série e os botões `ver agora` / `fila aleatória` **desabilitados** até
clicar num chip.

- [ ] **Step 3: Verificar as 4 interações no mock**

1. Clicar num chip → ele fica destacado e os dois botões de baixo habilitam.
2. Clicar em `▶ ver agora` → o terminal do mock imprime `[mock] comando: { tipo: 'ver-agora', slug: '...' }`.
3. Digitar no filtro → a lista de chips reduz e **o foco não se perde** enquanto digita.
4. `↩ voltar pra grade` aparece desabilitado (o mock reporta `origem: 'grade'`).

Se qualquer uma falhar, conserte antes de seguir. Encerre o mock com Ctrl+C.

---

## Task 4: `tv.js` — plugar o `fila.js` e o servidor

**Files:**
- Modify: `televisor/tv.js`

- [ ] **Step 1: Importar os módulos novos**

Em `televisor/tv.js`, logo abaixo da linha `const { INIT_SCRIPT, faixaDoMinuto } = require('./vinheta');`, adicione:

```js
const { carregarCatalogos } = require('../emissora/gerar-grade');
const { decidir, criarOverride } = require('./fila');
const { iniciarControle } = require('./controle-servidor');
```

- [ ] **Step 2: Trocar o `programaAtual()` pelo `fila.js`**

Substitua a função `programaAtual()` inteira (linhas 24–35 do original) por:

```js
// Estado vivo da TV. É a ÚNICA coisa que o servidor de controle lê — ele nunca fala
// com o Playwright. Por isso /estado responde instantâneo e não pesa no player.
const estado = {
  ligada: false, override: null, origem: 'grade',
  entry: null, offsetSeg: 0, iniciadoEmMs: 0,
  ultimoTempoVideo: 0, ultimaLeituraMs: 0,
  grade: [], proximos: [],
};
let catalogos = carregarCatalogos();
let resolverComando = null; // acordado pelo POST /comando

function programaAtual() {
  const { diaStr, minutos } = agoraInfo();
  const { grade } = gerarAte(diaStr);
  estado.grade = grade;
  const d = decidir({ grade, minutosDia: minutos, override: estado.override, agoraMs: Date.now(), catalogos });
  estado.override = d.override;
  estado.origem = d.origem;
  if (!d.entry) return null;
  estado.proximos = d.origem === 'fila'
    ? [] // preenchido pelo obterEstado a partir da fila
    : grade.filter((g) => g.inicioMin > (d.entry.inicioMin ?? minutos)).slice(0, 5);
  return { entry: d.entry, offsetSeg: d.offsetSeg, proximo: d.proximo };
}
```

- [ ] **Step 3: Subir o servidor de controle**

Logo depois da linha `ctx.on('close', () => { desligada = true; fimLimpo = true; });`, adicione:

```js
  // --- controle remoto -------------------------------------------------------
  // Se a porta estiver ocupada, a TV segue funcionando sem controle. Nunca o contrário.
  iniciarControle({
    porta: 4599,
    obterEstado: () => {
      if (!estado.ligada || !estado.entry) return { ligada: false };
      const decorrido = estado.ultimaLeituraMs
        ? estado.ultimoTempoVideo + (Date.now() - estado.ultimaLeituraMs) / 1000
        : (Date.now() - estado.iniciadoEmMs) / 1000;
      const durSeg = estado.entry.duracaoMs / 1000;
      const e = estado.entry;
      return {
        ligada: true, origem: estado.origem,
        fila: estado.override && estado.override.tipo === 'fila'
          ? { serie: estado.override.serie, restantes: estado.override.restante.length } : null,
        agora: { serie: e.serie, nome: e.nome, temporada: e.temporada, episodio: e.episodio,
          inicio: e.inicio, duracaoSeg: Math.round(durSeg),
          decorridoSeg: Math.max(0, Math.round(decorrido)),
          restanteSeg: Math.max(0, Math.round(durSeg - decorrido)) },
        // Em fila, o "a seguir" mostra a fila sorteada — nunca a grade, senão a
        // janelinha mostraria uma coisa e a TV tocaria outra.
        aSeguir: estado.override && estado.override.tipo === 'fila'
          ? estado.override.restante.slice(0, 5).map((ep) => ({ hora: '--:--', serie: estado.override.serie,
              te: 'T' + ep.temporada + 'E' + ep.episodio, intervalo: false }))
          : estado.proximos.map((g) => ({ hora: g.inicio, serie: g.serie,
              te: 'T' + g.temporada + 'E' + g.episodio, intervalo: !!g.intervalo })),
      };
    },
    obterSeries: () => Object.values(catalogos)
      .map((c) => ({ slug: c.slug, nome: c.nome, eps: c.episodios.length }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    enviarComando: (c) => {
      if (c.tipo === 'ver-agora' || c.tipo === 'fila') {
        const ov = criarOverride(catalogos, c.slug, c.tipo === 'fila' ? 'fila' : 'zap',
          (Date.now() ^ 0x5bf03635) >>> 0, Date.now());
        if (!ov) return { ok: false, erro: 'serie sem episodio valido: ' + c.slug };
        estado.override = ov;
      } else if (c.tipo === 'voltar-grade') {
        estado.override = null;
      } else if (c.tipo === 'pular') {
        if (estado.override) {
          // fila -> proximo sorteado; zap -> volta pra grade. Basta "envelhecer" o
          // iniciadoEm: o fila.js trata o episodio como terminado na proxima decisao.
          estado.override = { ...estado.override, iniciadoEm: Date.now() - estado.entry.duracaoMs - 1 };
        } else {
          // na grade -> antecipa o proximo item, do inicio (fica adiantado; decisao da spec)
          const prox = estado.proximos[0];
          if (!prox) return { ok: false, erro: 'nao ha proximo na grade' };
          estado.override = { tipo: 'zap', slug: prox.slug, serie: prox.serie, seed: 0,
            atual: prox, restante: [], iniciadoEm: Date.now() };
        }
      }
      if (resolverComando) { resolverComando(); resolverComando = null; } // troca em <1s
      return { ok: true };
    },
    aoErro: (e) => log('⚠️ controle indisponível (' + e.code + ') — a TV segue normal'),
  });
```

- [ ] **Step 4: Marcar o estado a cada programa**

Dentro do `while (!desligada)`, logo depois de `const { entry, offsetSeg } = prog;`, adicione:

```js
    estado.ligada = true; estado.entry = entry; estado.offsetSeg = offsetSeg;
    estado.iniciadoEmMs = Date.now() - offsetSeg * 1000;
    estado.ultimoTempoVideo = offsetSeg; estado.ultimaLeituraMs = Date.now();
```

- [ ] **Step 5: Fazer o comando interromper o vigia na hora**

No loop de vigia, substitua a linha

```js
        await page.waitForTimeout(Math.min(TICK_MS, Math.max(500, deadline - Date.now())));
```

por:

```js
        // Promise.race: ou passa o tick, ou chega um comando do controle. Sem isso o
        // clique ficaria preso até 5s dentro do waitForTimeout.
        const espera = page.waitForTimeout(Math.min(TICK_MS, Math.max(500, deadline - Date.now())));
        const comando = new Promise((r) => { resolverComando = r; });
        const veioComando = await Promise.race([espera.then(() => false), comando.then(() => true)]);
        resolverComando = null;
        if (veioComando) { log('Comando do controle — trocando'); break; }
```

- [ ] **Step 6: Alimentar o tempo do vídeo pro `/estado`**

No mesmo loop de vigia, logo depois do bloco `if (t && !t.pausado) { ... }`, adicione:

```js
        if (t) { estado.ultimoTempoVideo = t.tempo; estado.ultimaLeituraMs = Date.now(); }
```

- [ ] **Step 7: Marcar desligada no fim**

Antes da linha `log(fimLimpo ? 'TV desligada (janela fechada).' : ...)`, adicione:

```js
  estado.ligada = false;
```

- [ ] **Step 8: Checkpoint de sintaxe**

```bash
node --check televisor/tv.js
```

Esperado: nenhuma saída (sintaxe ok).

---

## Task 5: o fix do volume

**Files:**
- Modify: `televisor/tv.js`
- Create: `televisor/preferencias.js`
- Test: `televisor/preferencias.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Create `televisor/preferencias.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { lerVolume, gravarVolume } = require('./preferencias');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cttv-')), 'preferencias.json');

test('sem arquivo, lerVolume devolve null (a TV nao deve mexer em nada)', () => {
  assert.equal(lerVolume(tmp()), null);
});

test('grava e le o mesmo volume', () => {
  const f = tmp();
  gravarVolume(f, 0.35);
  assert.equal(lerVolume(f), 0.35);
});

test('arquivo corrompido nao explode, devolve null', () => {
  const f = tmp();
  fs.writeFileSync(f, '{isso nao e json');
  assert.equal(lerVolume(f), null);
});

test('volume fora de 0..1 e recusado na gravacao', () => {
  const f = tmp();
  gravarVolume(f, 5);
  assert.equal(lerVolume(f), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --test televisor/preferencias.test.js
```

Esperado: `Cannot find module './preferencias'`.

- [ ] **Step 3: Escrever o módulo**

Create `televisor/preferencias.js`:

```js
// Volume que o Lucas deixou. Existe porque o tv.js forçava volume = 1 a cada troca:
// a TV abria no máximo mesmo com a HUD do Max mostrando outro valor.
const fs = require('fs');

function lerVolume(arquivo) {
  try {
    const j = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const v = Number(j.volume);
    return (v >= 0 && v <= 1) ? v : null;
  } catch (e) { return null; }
}

function gravarVolume(arquivo, v) {
  if (!(v >= 0 && v <= 1)) return false;
  try { fs.writeFileSync(arquivo, JSON.stringify({ volume: v }, null, 2)); return true; }
  catch (e) { return false; }
}

module.exports = { lerVolume, gravarVolume };
```

- [ ] **Step 4: Rodar e ver passar**

```bash
node --test televisor/preferencias.test.js
```

Esperado: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Tirar o `volume = 1` do `tv.js`**

Em `televisor/tv.js`, adicione o import junto dos outros:

```js
const { lerVolume, gravarVolume } = require('./preferencias');
const ARQ_PREF = path.join(__dirname, 'preferencias.json');
```

Depois, dentro do loop que espera o vídeo rodar, substitua o bloco

```js
        const ok = await page.evaluate((seg) => {
          const v = document.querySelector('video');
          if (!v) return false;
          v.muted = false; v.volume = 1;
```

por:

```js
        const volSalvo = lerVolume(ARQ_PREF);
        const ok = await page.evaluate(({ seg, vol }) => {
          const v = document.querySelector('video');
          if (!v) return false;
          v.muted = false;
          // Sem preferência salva, NÃO mexe no volume — deixa o Max mandar.
          if (vol != null && Math.abs(v.volume - vol) > 0.01) v.volume = vol;
```

E ajuste o fechamento desse `page.evaluate` — troque

```js
        }, offsetSeg).catch(() => false);
```

por:

```js
        }, { seg: offsetSeg, vol: volSalvo }).catch(() => false);
```

⚠️ Dentro do corpo do `evaluate`, as duas referências a `seg` continuam válidas porque o parâmetro
agora é desestruturado — confira que as linhas `if (seg > 15 && Math.abs(v.currentTime - seg) > 20)`
seguem intactas.

- [ ] **Step 6: Fazer a TV aprender o volume**

No loop de vigia, troque a leitura do tempo

```js
        const t = await page.evaluate(() => {
          const v = document.querySelector('video');
          return v ? { tempo: v.currentTime, pausado: v.paused } : null;
        }).catch(() => null);
```

por:

```js
        const t = await page.evaluate(() => {
          const v = document.querySelector('video');
          return v ? { tempo: v.currentTime, pausado: v.paused, vol: v.volume } : null;
        }).catch(() => null);
        // Aprende o volume quando o Lucas mexe no controle do próprio Max.
        if (t && typeof t.vol === 'number' && Math.abs(t.vol - (lerVolume(ARQ_PREF) ?? -1)) > 0.01) {
          gravarVolume(ARQ_PREF, t.vol);
        }
```

- [ ] **Step 7: Checkpoint**

```bash
node --check televisor/tv.js && node --test televisor/
```

Esperado: sintaxe ok e todos os testes passando.

---

## Task 6: atalho da janelinha

**Files:**
- Create: `abrir-controle.vbs`
- Create: atalho no Desktop e no Menu Iniciar

- [ ] **Step 1: Criar o `.vbs`**

Create `abrir-controle.vbs` na raiz de `cartoon-tv` (ao lado do `ligar-tv.vbs`):

```vbs
' Abre a janelinha de controle. Se a TV estiver desligada, liga antes e espera o servidor subir.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)

Function TvNoAr()
  TvNoAr = False
  On Error Resume Next
  Set req = CreateObject("MSXML2.XMLHTTP")
  req.Open "GET", "http://127.0.0.1:4599/estado", False
  req.Send
  If Err.Number = 0 And req.Status = 200 Then TvNoAr = True
  On Error Goto 0
End Function

If Not TvNoAr() Then
  sh.Run "wscript.exe //nologo """ & base & "\ligar-tv.vbs""", 0, False
  For i = 1 To 40            ' até 40s esperando o servidor
    WScript.Sleep 1000
    If TvNoAr() Then Exit For
  Next
End If

perfil = base & "\televisor\.chrome-controle"
chrome = sh.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe\")
sh.Run """" & chrome & """ --app=http://127.0.0.1:4599/ --user-data-dir=""" & perfil & _
       """ --window-size=396,660 --no-first-run --disable-features=Translate", 1, False
```

- [ ] **Step 2: Testar o `.vbs` com a TV já ligada**

Ligue a TV pelo atalho existente, espere um episódio entrar, e então:

```bash
wscript.exe //nologo "abrir-controle.vbs"
```

Esperado: abre uma janelinha sem abas nem barra de endereço, mostrando o programa real no ar.

- [ ] **Step 3: Testar o caminho "TV desligada"**

Feche a janela da TV e rode o `.vbs` de novo. Esperado: ele liga a TV sozinho, espera, e só então abre
a janelinha já conectada.

- [ ] **Step 4: Criar os atalhos**

```powershell
$sh = New-Object -ComObject WScript.Shell
$base = "C:\Users\lucas\Documents\Claude\Local - Lucas Agostini\Main - 01\cartoon-tv"
foreach ($dir in @("$env:USERPROFILE\Desktop", "$env:APPDATA\Microsoft\Windows\Start Menu\Programs")) {
  $lnk = $sh.CreateShortcut("$dir\Controle Cartoon TV.lnk")
  $lnk.TargetPath = "C:\WINDOWS\System32\wscript.exe"
  $lnk.Arguments = "//nologo `"$base\abrir-controle.vbs`""
  $lnk.IconLocation = "%SystemRoot%\System32\imageres.dll,14"
  $lnk.Description = "Controle remoto da Cartoon TV"
  $lnk.Save()
}
```

Esperado: `Controle Cartoon TV` aparece no Desktop e no Menu Iniciar.

---

## Task 7: teste ao vivo

**Files:** nenhum — validação da coisa montada.

- [ ] **Step 1: Ligar TV + controle e conferir o básico**

Abra os dois atalhos. Confira na janelinha: a série no ar bate com a tela da TV, a barra anda, o
relógio anda, o `A SEGUIR` mostra os horários da grade.

- [ ] **Step 2: `▶ ver agora`**

Escolha uma série e clique. Esperado: a TV troca em **menos de 5 segundos**, a janelinha passa a mostrar
o badge `ZAP`, o `↩ voltar pra grade` habilita, e o `tv-log.txt` registra `Comando do controle — trocando`
seguido de `NO AR: <serie>`.

- [ ] **Step 3: `∞ fila aleatória`**

Escolha outra série e clique. Esperado: badge `FILA · <série>`, e o painel de baixo passa a listar a
**fila sorteada** (com `--:--` no lugar do horário), não a grade.

- [ ] **Step 4: `↩ voltar pra grade`**

Clique. Esperado: volta pro programa que a grade manda **naquele minuto**, entrando no meio dele — não
do início.

- [ ] **Step 5: `⏭ pular`**

Na grade, clique em pular. Esperado: entra o próximo item da grade, do início. Repita dentro de uma
fila: deve pular pro próximo sorteado, sem sair da fila.

- [ ] **Step 6: o volume**

Ajuste o volume no player do Max pra ~30%. Force uma troca pelo controle. Esperado: **o áudio volta no
mesmo nível**, e `televisor/preferencias.json` existe com um valor perto de `0.3`.

- [ ] **Step 7: a TV não cai por causa do controle**

Com a TV rodando, feche a janelinha do controle. Esperado: a TV continua tocando normalmente. Depois,
com a TV ligada, rode `node televisor/controle-servidor.js --mock` (porta ocupada): esperado
`⚠️ controle indisponível (EADDRINUSE)` no log e a TV **sem interrupção**.

- [ ] **Step 8: Atualizar a documentação**

Em `docs/2026-07-28-cartoon-tv-design.md`, na seção da sessão 29/07, registre: controle remoto no ar,
o fix do volume, e o que ficou de fora. Aponte pra spec `2026-07-29-controle-remoto-design.md`.

---

## Notas de execução

- **Ordem importa.** Tasks 1 e 2 não dependem da TV e são testáveis sozinhas; a Task 3 depende do mock da
  Task 2; as Tasks 4 e 5 mexem no `tv.js` e exigem religar a TV pra valer.
- **Religar a TV** durante o desenvolvimento: mate só os processos do perfil da TV, nunca o Chrome pessoal
  do Lucas —
  `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*televisor\.chrome-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
- **`televisor/.chrome-controle` e `televisor/preferencias.json`** são gerados em runtime. Se o projeto
  virar repo git um dia, ambos vão pro `.gitignore` junto com `.chrome-profile`.
- **Não mexa em `emissora/gerar-grade.js`.** Se algum teste te empurrar pra isso, o erro está no `fila.js`.
