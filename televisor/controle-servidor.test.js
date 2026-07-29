const test = require('node:test');
const assert = require('node:assert');
const { iniciarControle } = require('./controle-servidor');

const PORTA = 45991; // porta de teste, não a 4599 de produção

function subir(overrides = {}) {
  const comandos = [];
  const salvas = [];
  const excluidas = [];
  const server = iniciarControle({
    porta: PORTA,
    obterEstado: () => ({ ligada: true, origem: 'grade', agora: { serie: 'Dexter' } }),
    obterSeries: () => [{ slug: 'dexter', nome: 'Dexter', eps: 78 }],
    obterPlaylists: () => [{ id: 'favoritos', nome: 'Favoritos', slugs: ['dexter'], series: ['Dexter'], eps: 78 }],
    salvarPlaylist: (p) => { salvas.push(p); return { ok: true }; },
    excluirPlaylist: (id) => { excluidas.push(id); return id === 'favoritos' ? { ok: true } : { ok: false, erro: 'nao encontrada' }; },
    enviarComando: (c) => { comandos.push(c); return { ok: true }; },
    ...overrides,
  });
  return { server, comandos, salvas, excluidas };
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

// --- edição de playlists pelo controle --------------------------------------
test('GET /playlists devolve as playlists com os slugs (pro controle marcar os chips)', async () => {
  const { server } = subir();
  const j = await (await get('/playlists')).json();
  assert.deepEqual(j[0].slugs, ['dexter']);
  server.close();
});

test('POST /playlists/salvar entrega nome e séries', async () => {
  const { server, salvas } = subir();
  const r = await post('/playlists/salvar', { id: 'favoritos', nome: 'Favoritos', series: ['dexter', 'coragem'] });
  assert.equal(r.status, 200);
  assert.deepEqual(salvas[0], { id: 'favoritos', nome: 'Favoritos', series: ['dexter', 'coragem'] });
  server.close();
});

test('playlist VAZIA é barrada na borda, sem chegar no tv.js', async () => {
  const { server, salvas } = subir();
  const r = await post('/playlists/salvar', { nome: 'Vazia', series: [] });
  assert.equal(r.status, 400);
  assert.match((await r.json()).erro, /ao menos uma/);
  assert.equal(salvas.length, 0, 'nao devia ter chamado salvarPlaylist');
  server.close();
});

test('playlist sem nome é barrada', async () => {
  const { server, salvas } = subir();
  const r = await post('/playlists/salvar', { nome: '   ', series: ['dexter'] });
  assert.equal(r.status, 400);
  assert.equal(salvas.length, 0);
  server.close();
});

test('POST /playlists/excluir remove e recusa id inexistente', async () => {
  const { server, excluidas } = subir();
  assert.equal((await post('/playlists/excluir', { id: 'favoritos' })).status, 200);
  assert.equal((await post('/playlists/excluir', { id: 'fantasma' })).status, 400);
  assert.deepEqual(excluidas, ['favoritos', 'fantasma']);
  server.close();
});

test('comando playlist-avulsa leva o array de séries', async () => {
  const { server, comandos } = subir();
  const r = await post('/comando', { tipo: 'playlist-avulsa', series: ['dexter', 'coragem'] });
  assert.equal(r.status, 200);
  assert.deepEqual(comandos[0], { tipo: 'playlist-avulsa', series: ['dexter', 'coragem'] });
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
