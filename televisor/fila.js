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
  const c = catalogos && catalogos[slug];
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
// fila -> próximo do baralho; baralho esgotado reembaralha e segue
//         (sem isso a maratona morreria no fim da série, e série de 1 episódio nem começaria)
function avancarOverride(ov, agoraMs, catalogos) {
  if (!ov || ov.tipo !== 'fila') return null;
  let restante = ov.restante;
  let seed = ov.seed;
  if (!restante.length) {
    const c = catalogos && catalogos[ov.slug];
    if (!c || !c.episodios.length) return null;
    seed = (ov.seed * 1664525 + 1013904223) >>> 0;
    restante = embaralhar(c.episodios, seed);
  }
  const [prox, ...resto] = restante;
  return { ...ov, seed, atual: entryDeEpisodio(ov.slug, ov.serie, prox), restante: resto, iniciadoEm: agoraMs };
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
      fila: ov.tipo === 'fila' ? { serie: ov.serie, restantes: ov.restante.length } : null,
    };
  }

  return { ...programaDaGrade(grade, minutosDia), origem: 'grade', override: null, fila: null };
}

module.exports = { decidir, criarOverride, avancarOverride, embaralhar, entryDeEpisodio, programaDaGrade };
