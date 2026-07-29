// Gerador de grade da Cartoon TV.
// Determinístico: a grade de um dia é função (config, catálogo, data) — gerar
// duas vezes dá o mesmo resultado. A progressão dos episódios é simulada dia a
// dia desde a época do canal, então cada série anda em sequência entre os dias.
// Uso: node gerar-grade.js [AAAA-MM-DD]   (default: hoje, hora local do PC)
const fs = require('fs');
const path = require('path');

const AQUI = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(AQUI, 'canal-cartoon.json'), 'utf8'));

// ---------- PRNG com seed (mulberry32) ----------
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

// ---------- catálogo ----------
function carregarCatalogos() {
  const dir = path.join(AQUI, 'catalogo');
  const cat = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const eps = (j.episodios || []).filter((e) => e.duracaoMs && e.temporada != null && e.episodio != null);
    if (eps.length) cat[j.slug] = { slug: j.slug, nome: j.nomeOficial, episodios: eps };
  }
  return cat;
}

// ---------- helpers de data (hora local do PC = São Paulo) ----------
function diasDesde(epocaStr, diaStr) {
  return Math.round((new Date(diaStr + 'T12:00:00') - new Date(epocaStr + 'T12:00:00')) / 86400000);
}
function fmtHora(min) {
  const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// ---------- geração de um dia ----------
// ponteiros: { slug: proximoIndiceDeEpisodio } — muta ao longo da simulação
function gerarDia(diaStr, catalogos, ponteiros) {
  const rnd = mulberry32(hashStr(config.nome + '|' + diaStr));
  const diaSemana = new Date(diaStr + 'T12:00:00').getDay();
  const timeline = [];
  let blocosDesdeIntervalo = 0;

  const pegarEp = (slug) => {
    const c = catalogos[slug];
    if (!c) return null;
    const i = (ponteiros[slug] || 0) % c.episodios.length;
    ponteiros[slug] = ((ponteiros[slug] || 0) + 1);
    return c.episodios[i];
  };

  // minuto corrente dentro do dia de programação (começa em inicioDia)
  const [h0, m0] = config.inicioDia.split(':').map(Number);
  let cursor = h0 * 60 + m0;

  for (const faixa of config.faixas) {
    const [iniH, iniM] = faixa.de.split(':').map(Number);
    const [fimH, fimM] = faixa.ate.split(':').map(Number);
    let ini = iniH * 60 + iniM, fim = fimH * 60 + fimM;
    const inicioDiaMin = h0 * 60 + m0;
    if (ini < inicioDiaMin) { ini += 24 * 60; fim += 24 * 60; } // faixa da madrugada = dia seguinte
    if (fim <= ini) fim += 24 * 60; // faixa cruza meia-noite
    if (cursor < ini) cursor = ini;

    // séries desta faixa hoje (filtra "diasSemana" opcional, ex.: Força Alienígena)
    let series = faixa.series.filter((s) => {
      if (typeof s === 'string') return true;
      return !s.diasSemana || s.diasSemana.includes(diaSemana);
    }).map((s) => (typeof s === 'string' ? s : s.slug)).filter((s) => catalogos[s]);
    if (!series.length) continue;
    let ordem = embaralhar(series, rnd);
    let idx = 0;

    while (cursor < fim) {
      // intervalo institucional a cada N blocos
      if (config.intervalo && blocosDesdeIntervalo >= config.intervalo.aCadaBlocos && catalogos[config.intervalo.slug]) {
        const ep = pegarEp(config.intervalo.slug);
        if (ep) {
          const dur = ep.duracaoMs / 60000;
          timeline.push({ inicioMin: cursor, slug: config.intervalo.slug, ep, intervalo: true });
          cursor += dur;
          blocosDesdeIntervalo = 0;
          continue;
        }
      }
      // bloco de série: junta episódios sequenciais até ~metaMinutos
      const slug = ordem[idx % ordem.length]; idx++;
      const meta = config.metaMinutosBloco || 22;
      let usado = 0, algum = false;
      while (usado < meta * 0.8 && cursor + usado < fim + 10) {
        const ep = pegarEp(slug);
        if (!ep) break;
        const dur = ep.duracaoMs / 60000;
        timeline.push({ inicioMin: cursor + usado, slug, ep, intervalo: false });
        usado += dur; algum = true;
        if (dur >= meta * 0.8) break; // episódio longo (~22min+) já fecha o bloco
      }
      if (!algum) break;
      cursor += usado;
      blocosDesdeIntervalo++;
    }
  }

  // materializa em horários reais
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

// ---------- simulação desde a época + CLI ----------
function gerarAte(diaAlvoStr) {
  const catalogos = carregarCatalogos();
  const n = diasDesde(config.epoca, diaAlvoStr);
  if (n < 0) throw new Error('dia antes da época do canal');
  const ponteiros = {};
  let grade = null;
  for (let d = 0; d <= n; d++) {
    const dia = new Date(new Date(config.epoca + 'T12:00:00').getTime() + d * 86400000);
    const diaStr = dia.toISOString().slice(0, 10);
    grade = gerarDia(diaStr, catalogos, ponteiros);
    if (d === n) return { diaStr, grade, series: Object.keys(catalogos).length };
  }
}

if (require.main === module) {
  const hoje = new Date();
  const alvo = process.argv[2] || (hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0'));
  const { diaStr, grade, series } = gerarAte(alvo);
  const outDir = path.join(AQUI, 'grade');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, diaStr + '.json'), JSON.stringify(grade, null, 2));
  console.log('Grade de ' + diaStr + ' (' + series + ' séries no catálogo, ' + grade.length + ' exibições):');
  for (const g of grade.slice(0, 200)) {
    console.log('  ' + g.inicio + '  ' + (g.intervalo ? '[INT] ' : '') + g.slug + ' T' + g.temporada + 'E' + g.episodio + ' — ' + g.nome);
  }
}

module.exports = { gerarAte, gerarDia, carregarCatalogos };
