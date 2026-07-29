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
  let origem = 'grade';
  iniciarControle({
    porta: 4599,
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
    enviarComando: (c) => {
      console.log('[mock] comando:', c);
      if (c.tipo === 'ver-agora') origem = 'zap';
      else if (c.tipo === 'fila') origem = 'fila';
      else if (c.tipo === 'voltar-grade') origem = 'grade';
      return { ok: true };
    },
    aoErro: (e) => { console.error('mock:', e.message); process.exit(1); },
  });
  console.log('mock em http://127.0.0.1:4599');
}
