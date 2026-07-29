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
  const { server } = subir({ enviarComando: () => ({ ok: false, erro: 'serie sem episodio' }) });
  const r = await post('/comando', { tipo: 'fila', slug: 'x' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).erro, /sem episodio/);
  server.close();
});

test('rota desconhecida responde 404', async () => {
  const { server } = subir();
  assert.equal((await get('/nada')).status, 404);
  server.close();
});

test('GET / serve o controle.html', async () => {
  const { server } = subir();
  const r = await get('/');
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /Controle/);
  server.close();
});

test('porta ocupada chama aoErro em vez de derrubar o processo', async () => {
  const a = subir();
  let capturado = null;
  const b = iniciarControle({
    porta: PORTA, obterEstado: () => ({}), obterSeries: () => [], enviarComando: () => ({ ok: true }),
    aoErro: (e) => { capturado = e; },
  });
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(capturado, 'aoErro devia ter sido chamado');
  assert.equal(capturado.code, 'EADDRINUSE');
  a.server.close(); b.close();
});
