// Decide O QUE TOCAR AGORA. Módulo puro: sem Playwright, sem HTTP, sem relógio próprio —
// a hora entra por parâmetro, por isso dá pra testar tudo sem abrir browser.
//
// override = null
//          | { tipo:'zap'|'fila', slugs:[...], nome, seed, atual:<entry>,
//              restante:[{slug,serie,ep}], iniciadoEm:<ms> }
//
// Uma PLAYLIST é só uma fila com vários slugs — mesmo caminho de código, sem ramo novo.
// zap = fila de um episódio só, que morre no fim.
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

// Monta a fila de uma playlist ALTERNANDO entre as séries.
//
// Por que não juntar tudo num baralho só: Hora de Aventura tem 275 episódios e
// Smiling Friends tem 27 — no sorteio simples o Smiling Friends quase não apareceria.
// Aqui cada rodada embaralha a ORDEM das séries e tira um episódio de cada, então
// as séries se revezam e nenhuma domina, independente do tamanho do catálogo.
function montarFila(catalogos, slugs, seed) {
  const validos = slugs.filter((s) => catalogos[s] && catalogos[s].episodios.length);
  if (!validos.length) return [];

  // baralho próprio de cada série: sorteado, sem repetir até esgotar
  const baralhos = {};
  validos.forEach((s, i) => { baralhos[s] = embaralhar(catalogos[s].episodios, (seed + i * 7919) >>> 0); });

  const fila = [];
  const maior = Math.max(...validos.map((s) => baralhos[s].length));
  for (let rodada = 0; rodada < maior; rodada++) {
    // só as séries que ainda têm episódio nesta rodada
    const disponiveis = validos.filter((s) => baralhos[s][rodada]);
    // ordem muda a cada rodada, senão vira ciclo previsível A,B,C,A,B,C
    const ordem = embaralhar(disponiveis, (seed + rodada * 104729) >>> 0);
    // evita a emenda: última da rodada anterior igual à primeira desta
    const ultimo = fila.length ? fila[fila.length - 1].slug : null;
    if (ordem.length > 1 && ordem[0] === ultimo) { [ordem[0], ordem[1]] = [ordem[1], ordem[0]]; }
    for (const s of ordem) fila.push({ slug: s, serie: catalogos[s].nome, ep: baralhos[s][rodada] });
  }
  return fila;
}

// tipo: 'zap' (um episódio e volta pra grade) | 'fila' (segue até mandarem parar)
// slugs: uma série ou várias (playlist). nome: o que aparece no badge do controle.
function criarOverride(catalogos, slugs, tipo, seed, agoraMs, nome) {
  const lista = Array.isArray(slugs) ? slugs : [slugs];
  const fila = montarFila(catalogos, lista, seed);
  if (!fila.length) return null;
  const [primeiro, ...resto] = fila;
  return {
    tipo, slugs: lista, seed,
    nome: nome || primeiro.serie,
    atual: entryDeEpisodio(primeiro.slug, primeiro.serie, primeiro.ep),
    restante: tipo === 'zap' ? [] : resto,
    iniciadoEm: agoraMs,
  };
}

// Chamado quando o episódio corrente termina.
// zap  -> null (volta pra grade)
// fila -> próximo da fila; fila esgotada remonta com seed derivada e segue
//         (sem isso a maratona morreria no fim, e série de 1 episódio nem começaria)
function avancarOverride(ov, agoraMs, catalogos) {
  if (!ov || ov.tipo !== 'fila') return null;
  let restante = ov.restante;
  let seed = ov.seed;
  if (!restante.length) {
    seed = (ov.seed * 1664525 + 1013904223) >>> 0;
    restante = montarFila(catalogos || {}, ov.slugs, seed);
    if (!restante.length) return null;
  }
  const [prox, ...resto] = restante;
  return { ...ov, seed, atual: entryDeEpisodio(prox.slug, prox.serie, prox.ep), restante: resto, iniciadoEm: agoraMs };
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

  // Consome os episódios que já terminaram desde a última decisão.
  let guarda = 0;
  while (ov && guarda++ < 500) {
    if (agoraMs - ov.iniciadoEm < ov.atual.duracaoMs) break; // ainda tocando
    ov = avancarOverride(ov, ov.iniciadoEm + ov.atual.duracaoMs, catalogos);
  }

  if (ov) {
    return {
      entry: ov.atual,
      offsetSeg: Math.max(0, Math.floor((agoraMs - ov.iniciadoEm) / 1000)),
      origem: ov.tipo, override: ov,
      proximo: ov.tipo === 'fila' ? (ov.restante[0] || null) : null,
      fila: ov.tipo === 'fila' ? { serie: ov.nome, restantes: ov.restante.length } : null,
    };
  }

  return { ...programaDaGrade(grade, minutosDia), origem: 'grade', override: null, fila: null };
}

module.exports = { decidir, criarOverride, avancarOverride, embaralhar, entryDeEpisodio, programaDaGrade, montarFila };
