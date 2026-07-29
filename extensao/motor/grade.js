// Gerador de grade — mesmo algoritmo do emissora/gerar-grade.js, sem `fs`.
// Determinístico: a grade de um dia é função (config, catálogo, data). A progressão dos
// episódios é simulada dia a dia desde a época do canal, então cada série anda em
// sequência entre os dias sem guardar estado em lugar nenhum.

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function embaralhar(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function diasDesde(epocaStr, diaStr) {
  return Math.round((new Date(diaStr + 'T12:00:00') - new Date(epocaStr + 'T12:00:00')) / 86400000);
}
function fmtHora(min) {
  const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function gerarDia(diaStr, config, catalogos, ponteiros) {
  const rnd = mulberry32(hashStr(config.nome + '|' + diaStr));
  const diaSemana = new Date(diaStr + 'T12:00:00').getDay();
  const timeline = [];
  let blocosDesdeIntervalo = 0;

  const pegarEp = (slug) => {
    const c = catalogos[slug];
    if (!c) return null;
    const i = (ponteiros[slug] || 0) % c.episodios.length;
    ponteiros[slug] = (ponteiros[slug] || 0) + 1;
    return c.episodios[i];
  };

  const [h0, m0] = config.inicioDia.split(':').map(Number);
  let cursor = h0 * 60 + m0;

  for (const faixa of config.faixas) {
    const [iniH, iniM] = faixa.de.split(':').map(Number);
    const [fimH, fimM] = faixa.ate.split(':').map(Number);
    let ini = iniH * 60 + iniM, fim = fimH * 60 + fimM;
    const inicioDiaMin = h0 * 60 + m0;
    if (ini < inicioDiaMin) { ini += 24 * 60; fim += 24 * 60; }
    if (fim <= ini) fim += 24 * 60;
    if (cursor < ini) cursor = ini;

    const series = faixa.series
      .filter((s) => (typeof s === 'string' ? true : (!s.diasSemana || s.diasSemana.includes(diaSemana))))
      .map((s) => (typeof s === 'string' ? s : s.slug))
      .filter((s) => catalogos[s]);
    if (!series.length) continue;
    const ordem = embaralhar(series, rnd);
    let idx = 0;

    while (cursor < fim) {
      if (config.intervalo && blocosDesdeIntervalo >= config.intervalo.aCadaBlocos && catalogos[config.intervalo.slug]) {
        const ep = pegarEp(config.intervalo.slug);
        if (ep) {
          timeline.push({ inicioMin: cursor, slug: config.intervalo.slug, ep, intervalo: true });
          cursor += ep.duracaoMs / 60000;
          blocosDesdeIntervalo = 0;
          continue;
        }
      }
      const slug = ordem[idx % ordem.length]; idx++;
      const meta = config.metaMinutosBloco || 22;
      let usado = 0, algum = false;
      while (usado < meta * 0.8 && cursor + usado < fim + 10) {
        const ep = pegarEp(slug);
        if (!ep) break;
        const dur = ep.duracaoMs / 60000;
        timeline.push({ inicioMin: cursor + usado, slug, ep, intervalo: false });
        usado += dur; algum = true;
        if (dur >= meta * 0.8) break;
      }
      if (!algum) break;
      cursor += usado;
      blocosDesdeIntervalo++;
    }
  }

  return timeline.map((t) => ({
    inicio: fmtHora(t.inicioMin),
    inicioMin: Math.round(t.inicioMin * 100) / 100,
    duracaoMs: t.ep.duracaoMs,
    slug: t.slug,
    serie: (catalogos[t.slug] || {}).nome || t.slug,
    intervalo: t.intervalo,
    nome: t.ep.nome,
    temporada: t.ep.temporada,
    episodio: t.ep.episodio,
    videoId: t.ep.videoId,
    editId: t.ep.editId,
  }));
}

// Simula da época até o dia alvo. Com poucos dias é instantâneo; se o canal ficar velho,
// vale memoizar por diaStr (o resultado é sempre o mesmo).
export function gerarAte(diaAlvoStr, config, catalogos) {
  const n = diasDesde(config.epoca, diaAlvoStr);
  if (n < 0) throw new Error('dia antes da época do canal');
  const ponteiros = {};
  let grade = null;
  for (let d = 0; d <= n; d++) {
    const dia = new Date(new Date(config.epoca + 'T12:00:00').getTime() + d * 86400000);
    const diaStr = dia.toISOString().slice(0, 10);
    grade = gerarDia(diaStr, config, catalogos, ponteiros);
  }
  return grade;
}

// Dia de programação começa 06:00; antes disso vale a grade de ontem.
export function agoraInfo(agora = new Date()) {
  let diaProg = new Date(agora);
  let minutos = agora.getHours() * 60 + agora.getMinutes() + agora.getSeconds() / 60;
  if (agora.getHours() < 6) { diaProg = new Date(agora.getTime() - 86400000); minutos += 24 * 60; }
  const diaStr = diaProg.getFullYear() + '-' +
    String(diaProg.getMonth() + 1).padStart(2, '0') + '-' +
    String(diaProg.getDate()).padStart(2, '0');
  return { diaStr, minutos };
}
