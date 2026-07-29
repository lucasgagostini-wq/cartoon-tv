// Monta extensao/dados/ a partir do que a emissora já tem.
// A extensão não pode ler o disco: o catálogo (29 arquivos) vira UM bundle carregado por
// fetch(chrome.runtime.getURL(...)). Rode sempre que recapturar séries ou mexer na grade.
// Uso: node empacotar-extensao.js
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const CAT_DIR = path.join(RAIZ, 'emissora', 'catalogo');
const OUT = path.join(RAIZ, 'extensao', 'dados');

fs.mkdirSync(OUT, { recursive: true });

// ---- catálogo: um objeto { slug: { slug, nome, episodios[] } } ----
const catalogo = {};
let totalEps = 0;
for (const f of fs.readdirSync(CAT_DIR)) {
  if (!f.endsWith('.json')) continue;
  const j = JSON.parse(fs.readFileSync(path.join(CAT_DIR, f), 'utf8'));
  const eps = (j.episodios || [])
    .filter((e) => e.duracaoMs && e.temporada != null && e.episodio != null)
    // só o que a grade usa — corta airDate/showId e economiza ~40% do arquivo
    .map((e) => ({ nome: e.nome, temporada: e.temporada, episodio: e.episodio,
      duracaoMs: e.duracaoMs, videoId: e.videoId, editId: e.editId }));
  if (!eps.length) continue;
  catalogo[j.slug] = { slug: j.slug, nome: j.nomeOficial, episodios: eps };
  totalEps += eps.length;
}

fs.writeFileSync(path.join(OUT, 'catalogo.json'), JSON.stringify(catalogo));
fs.copyFileSync(path.join(RAIZ, 'emissora', 'canal-cartoon.json'), path.join(OUT, 'canal.json'));
fs.copyFileSync(path.join(RAIZ, 'emissora', 'playlists.json'), path.join(OUT, 'playlists.json'));

const kb = (p) => Math.round(fs.statSync(path.join(OUT, p)).size / 1024);
console.log('catalogo.json: ' + Object.keys(catalogo).length + ' séries, ' + totalEps + ' eps, ' + kb('catalogo.json') + ' KB');
console.log('canal.json: ' + kb('canal.json') + ' KB   playlists.json: ' + kb('playlists.json') + ' KB');
