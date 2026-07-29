// Servidor da janelinha de controle. Escuta SÓ em 127.0.0.1.
//
// REGRA DE OURO: este módulo não conhece Playwright, não conhece a grade e nunca toca no player.
// Ele recebe callbacks e devolve o que elas disserem. Assim /estado responde instantâneo (é leitura
// de um objeto em memória) e um travamento do Chrome não derruba o controle junto.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TIPOS_VALIDOS = new Set(['ver-agora', 'fila', 'playlist', 'playlist-avulsa', 'pular', 'voltar-grade']);

function json(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

// Só a própria máquina entra sem chave. Qualquer outro aparelho da rede precisa apresentar
// a chave — senão bastaria estar no mesmo Wi-Fi pra mandar na TV dos outros.
function ehLocal(req) {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1';
}
function autorizado(req, chave) {
  if (!chave || ehLocal(req)) return true;
  const url = new URL(req.url, 'http://x');
  return url.searchParams.get('k') === chave || req.headers['x-chave'] === chave;
}

function iniciarControle({ porta = 4599, host = '127.0.0.1', chave = null,
                          obterEstado, obterSeries, obterPlaylists,
                          salvarPlaylist, excluirPlaylist, enviarComando, aoErro }) {
  const server = http.createServer(async (req, res) => {
    const rota = (req.url || '').split('?')[0];

    if (!autorizado(req, chave)) return json(res, 403, { erro: 'chave invalida' });

    if (req.method === 'GET' && (rota === '/' || rota === '/controle.html')) {
      return fs.readFile(path.join(__dirname, 'controle.html'), (err, buf) => {
        if (err) { res.writeHead(500); return res.end('controle.html nao encontrado'); }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(buf);
      });
    }
    if (req.method === 'GET' && rota === '/estado') return json(res, 200, obterEstado());
    if (req.method === 'GET' && rota === '/series') return json(res, 200, obterSeries());
    if (req.method === 'GET' && rota === '/playlists') return json(res, 200, obterPlaylists ? obterPlaylists() : []);

    if (req.method === 'POST' && rota === '/playlists/salvar') {
      const corpo = await lerCorpo(req);
      if (!corpo || !Array.isArray(corpo.series)) return json(res, 400, { erro: 'payload invalido' });
      if (!String(corpo.nome || '').trim()) return json(res, 400, { erro: 'a playlist precisa de um nome' });
      // barrado aqui, na borda, e não só no tv.js: playlist vazia não toca nada
      if (!corpo.series.length) return json(res, 400, { erro: 'escolha ao menos uma serie' });
      if (!salvarPlaylist) return json(res, 400, { erro: 'edicao indisponivel' });
      const r = salvarPlaylist(corpo);
      return r && r.ok ? json(res, 200, { ok: true }) : json(res, 400, { erro: (r && r.erro) || 'recusado' });
    }

    if (req.method === 'POST' && rota === '/playlists/excluir') {
      const corpo = await lerCorpo(req);
      if (!corpo || !corpo.id) return json(res, 400, { erro: 'id obrigatorio' });
      if (!excluirPlaylist) return json(res, 400, { erro: 'edicao indisponivel' });
      const r = excluirPlaylist(corpo.id);
      return r && r.ok ? json(res, 200, { ok: true }) : json(res, 400, { erro: (r && r.erro) || 'recusado' });
    }

    if (req.method === 'POST' && rota === '/comando') {
      const corpo = await lerCorpo(req);
      if (!corpo || !TIPOS_VALIDOS.has(corpo.tipo)) return json(res, 400, { erro: 'comando invalido' });
      const r = enviarComando({ tipo: corpo.tipo,
        ...(corpo.slug ? { slug: corpo.slug } : {}),
        ...(Array.isArray(corpo.series) ? { series: corpo.series } : {}) });
      return r && r.ok ? json(res, 200, { ok: true }) : json(res, 400, { erro: (r && r.erro) || 'recusado' });
    }

    json(res, 404, { erro: 'rota desconhecida' });
  });

  // Porta ocupada não pode derrubar a TV: avisa e segue sem controle.
  server.on('error', (e) => { if (aoErro) aoErro(e); else throw e; });
  server.listen(porta, host);
  return server;
}

module.exports = { iniciarControle };

// Modo mock: `node controle-servidor.js --mock` sobe um /estado falso pra ajustar a UI
// com a TV desligada. Não depende de nada do resto do projeto.
if (require.main === module && process.argv.includes('--mock')) {
  const t0 = Date.now();
  let origem = 'grade';
  const mockPlaylists = [
    { id: 'favoritos', nome: 'Favoritos', series: ['rick-morty', 'gumball', 'primal', 'chowder'] },
  ];
  const portaMock = Number(process.env.PORTA_MOCK) || 4599;  // outra porta = testar com a TV no ar
  iniciarControle({
    porta: portaMock,
    obterEstado: () => {
      const d = Math.floor((Date.now() - t0) / 1000) % 1260;
      return {
        ligada: true, origem, fila: origem === 'fila' ? { serie: 'Dexter', restantes: 12 } : null,
        agora: { serie: 'Rick & Morty', nome: 'A Revolta dos Meeseeks', temporada: 1, episodio: 5,
          inicio: '01:16', duracaoSeg: 1260, decorridoSeg: d, restanteSeg: 1260 - d },
        aSeguir: [
          { hora: '01:37', serie: 'Primal', te: 'T1E5', intervalo: false },
          { hora: '01:59', serie: 'Hora de Aventura com Fionna e Cake', te: 'T1E5', intervalo: false },
          { hora: '02:24', serie: 'Outra Semana No Cartoon', te: 'T3E7', intervalo: true },
          { hora: '02:36', serie: 'Coragem, o Cão Covarde', te: 'T1E7', intervalo: false },
        ],
      };
    },
    obterSeries: () => ['Dexter', 'Coragem', 'Johnny Bravo', 'Gumball', 'Titio Avô', 'Primal', 'Rick & Morty',
      'Apenas um Show', 'Samurai Jack', 'Clarêncio', 'Chowder', 'Flapjack']
      .map((n) => ({ slug: n.toLowerCase().replace(/\W+/g, '-'), nome: n, eps: 40 })),
    obterPlaylists: () => mockPlaylists.map((p) => ({
      id: p.id, nome: p.nome, slugs: p.series, series: p.series, eps: p.series.length * 40 })),
    salvarPlaylist: ({ id, nome, series }) => {
      const p = id && mockPlaylists.find((x) => x.id === id);
      if (p) { p.nome = nome; p.series = series; }
      else mockPlaylists.push({ id: nome.toLowerCase().replace(/\W+/g, '-'), nome, series });
      console.log('[mock] playlist salva:', nome, series);
      return { ok: true };
    },
    excluirPlaylist: (id) => {
      const i = mockPlaylists.findIndex((x) => x.id === id);
      if (i < 0) return { ok: false, erro: 'nao encontrada' };
      console.log('[mock] playlist excluida:', mockPlaylists[i].nome);
      mockPlaylists.splice(i, 1);
      return { ok: true };
    },
    enviarComando: (c) => {
      console.log('[mock] comando:', JSON.stringify(c));
      if (c.tipo === 'ver-agora') origem = 'zap';
      else if (c.tipo === 'fila' || c.tipo === 'playlist' || c.tipo === 'playlist-avulsa') origem = 'fila';
      else if (c.tipo === 'voltar-grade') origem = 'grade';
      return { ok: true };
    },
    aoErro: (e) => { console.error('mock:', e.message); process.exit(1); },
  });
  console.log('mock em http://127.0.0.1:' + portaMock);
}
