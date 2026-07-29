const test = require('node:test');
const assert = require('node:assert');
const { decidir, criarOverride, embaralhar, entryDeEpisodio, montarFila, chaveExibicao } = require('./fila');

// --- fixtures ---------------------------------------------------------------
const ep = (n, t, e, min) => ({ nome: n, temporada: t, episodio: e, duracaoMs: min * 60000,
  videoId: 'vid-' + n, editId: 'ed-' + n });

const serie = (slug, nome, qtd, min) => ({ slug, nome,
  episodios: Array.from({ length: qtd }, (_, i) => ep(slug + '-' + (i + 1), 1, i + 1, min)) });

const CATALOGO = {
  dexter: serie('dexter', 'O Laboratório de Dexter', 4, 11),
  coragem: { slug: 'coragem', nome: 'Coragem', episodios: [ep('X', 1, 1, 22)] },
  // playlist: uma série grande e uma pequena, pra provar o equilíbrio
  gumball: serie('gumball', 'Gumball', 30, 11),
  smiling: serie('smiling', 'Smiling Friends', 4, 11),
};

// grade: 06:00 dexter (11min), 06:11 coragem (22min)
const GRADE = [
  { inicio: '06:00', inicioMin: 360, duracaoMs: 11 * 60000, slug: 'dexter', serie: 'O Laboratório de Dexter',
    intervalo: false, nome: 'A', temporada: 1, episodio: 1, videoId: 'g1', editId: 'g1e' },
  { inicio: '06:11', inicioMin: 371, duracaoMs: 22 * 60000, slug: 'coragem', serie: 'Coragem',
    intervalo: false, nome: 'X', temporada: 1, episodio: 1, videoId: 'g2', editId: 'g2e' },
];

const T0 = 1_000_000_000_000; // instante fixo — nada de Date.now() nos testes
const dec = (o) => decidir({ grade: GRADE, catalogos: CATALOGO, ...o });

// --- grade normal -----------------------------------------------------------
test('sem override, devolve o programa da grade com o offset certo', () => {
  const d = dec({ minutosDia: 365, override: null, agoraMs: T0 });
  assert.equal(d.origem, 'grade');
  assert.equal(d.entry.slug, 'dexter');
  assert.equal(d.offsetSeg, 300);
  assert.equal(d.proximo.slug, 'coragem');
  assert.equal(d.override, null);
});

test('sem override e fora de qualquer faixa, devolve entry nula', () => {
  assert.equal(dec({ minutosDia: 100, override: null, agoraMs: T0 }).entry, null);
});

// --- zap (ver agora) --------------------------------------------------------
test('zap toca a série escolhida do início e ignora a grade', () => {
  const ov = criarOverride(CATALOGO, 'dexter', 'zap', 42, T0);
  const d = dec({ minutosDia: 365, override: ov, agoraMs: T0 });
  assert.equal(d.origem, 'zap');
  assert.equal(d.entry.slug, 'dexter');
  assert.equal(d.offsetSeg, 0);
  assert.equal(d.fila, null);
});

test('zap devolve o offset conforme o tempo passa', () => {
  const ov = criarOverride(CATALOGO, 'dexter', 'zap', 42, T0);
  assert.equal(dec({ minutosDia: 367, override: ov, agoraMs: T0 + 120_000 }).offsetSeg, 120);
});

test('quando o episódio do zap acaba, volta pra grade e o override morre', () => {
  const ov = criarOverride(CATALOGO, 'dexter', 'zap', 42, T0);
  const d = dec({ minutosDia: 372, override: ov, agoraMs: T0 + 12 * 60000 });
  assert.equal(d.origem, 'grade');
  assert.equal(d.override, null);
  assert.equal(d.entry.slug, 'coragem');
});

// --- fila de UMA série ------------------------------------------------------
test('fila emenda o próximo sorteado quando o episódio acaba', () => {
  const ov = criarOverride(CATALOGO, 'dexter', 'fila', 42, T0);
  const primeiro = ov.atual.nome;
  const d = dec({ minutosDia: 372, override: ov, agoraMs: T0 + 12 * 60000 });
  assert.equal(d.origem, 'fila');
  assert.notEqual(d.entry.nome, primeiro);
  assert.equal(d.offsetSeg, 60);
  assert.equal(d.fila.serie, 'O Laboratório de Dexter');
});

test('fila não repete episódio antes de esgotar a série', () => {
  let ov = criarOverride(CATALOGO, 'dexter', 'fila', 7, T0);
  const vistos = [ov.atual.nome];
  let t = T0;
  for (let i = 0; i < 3; i++) {
    t += 12 * 60000;
    const d = dec({ minutosDia: 365, override: ov, agoraMs: t });
    ov = d.override; vistos.push(d.entry.nome);
  }
  assert.equal(new Set(vistos).size, 4, 'os 4 episódios deviam sair sem repetir: ' + vistos.join(','));
});

test('fila esgotada remonta e continua, sem voltar pra grade', () => {
  let ov = criarOverride(CATALOGO, 'dexter', 'fila', 7, T0);
  let t = T0, d;
  for (let i = 0; i < 4; i++) { t += 12 * 60000; d = dec({ minutosDia: 365, override: ov, agoraMs: t }); ov = d.override; }
  assert.equal(d.origem, 'fila');
  assert.equal(d.entry.slug, 'dexter');
});

test('série de um episódio só não trava a fila', () => {
  const ov = criarOverride(CATALOGO, 'coragem', 'fila', 3, T0);
  const d = dec({ minutosDia: 365, override: ov, agoraMs: T0 + 23 * 60000 });
  assert.equal(d.origem, 'fila');
  assert.equal(d.entry.slug, 'coragem');
});

// --- PLAYLIST (fila com várias séries) --------------------------------------
test('playlist alterna entre as séries, nunca duas seguidas da mesma', () => {
  // 8 primeiras = as 4 rodadas em que AMBAS ainda têm episódio. Depois que a série
  // pequena esgota, repetir a grande é inevitável e correto.
  const fila = montarFila(CATALOGO, ['gumball', 'smiling'], 11);
  const oito = fila.slice(0, 8).map((x) => x.slug);
  for (let i = 1; i < oito.length; i++) {
    assert.notEqual(oito[i], oito[i - 1], 'repetiu série seguida na posição ' + i + ': ' + oito.join(','));
  }
});

test('playlist de 3 séries alterna sem emenda entre rodadas', () => {
  const CAT3 = { a: serie('a', 'A', 6, 11), b: serie('b', 'B', 6, 11), c: serie('c', 'C', 6, 11) };
  const fila = montarFila(CAT3, ['a', 'b', 'c'], 21).map((x) => x.slug);
  for (let i = 1; i < fila.length; i++) {
    assert.notEqual(fila[i], fila[i - 1], 'emendou na posição ' + i + ': ' + fila.join(','));
  }
});

test('playlist equilibra série grande e pequena (30 eps vs 4 eps)', () => {
  const fila = montarFila(CATALOGO, ['gumball', 'smiling'], 11);
  const oito = fila.slice(0, 8).map((x) => x.slug);
  const qtdSmiling = oito.filter((s) => s === 'smiling').length;
  assert.equal(qtdSmiling, 4, 'nas 8 primeiras devia haver 4 de cada, veio: ' + oito.join(','));
});

test('playlist não repete episódio até esgotar cada série', () => {
  const fila = montarFila(CATALOGO, ['gumball', 'smiling'], 11);
  const ids = fila.map((x) => x.slug + '/' + x.ep.nome);
  assert.equal(new Set(ids).size, ids.length, 'houve episódio repetido na fila da playlist');
  assert.equal(fila.length, 34, '30 de gumball + 4 de smiling');
});

test('playlist roda pelo decidir e mostra o nome da playlist no badge', () => {
  let ov = criarOverride(CATALOGO, ['gumball', 'smiling'], 'fila', 11, T0, 'Favoritos');
  const d = dec({ minutosDia: 365, override: ov, agoraMs: T0 + 12 * 60000 });
  assert.equal(d.origem, 'fila');
  assert.equal(d.fila.serie, 'Favoritos');
  assert.ok(['gumball', 'smiling'].includes(d.entry.slug));
});

test('playlist esgotada remonta sozinha e segue tocando', () => {
  let ov = criarOverride(CATALOGO, ['smiling', 'coragem'], 'fila', 5, T0, 'Curtas');
  let t = T0, d;
  for (let i = 0; i < 7; i++) { t += 25 * 60000; d = dec({ minutosDia: 365, override: ov, agoraMs: t }); ov = d.override; }
  assert.equal(d.origem, 'fila');
  assert.ok(d.entry, 'devia continuar tocando depois de esgotar as duas séries');
});

test('playlist ignora slug inexistente mas funciona com os válidos', () => {
  const fila = montarFila(CATALOGO, ['nao-existe', 'smiling'], 3);
  assert.equal(fila.length, 4);
  assert.ok(fila.every((x) => x.slug === 'smiling'));
});

test('playlist só com slugs inválidos devolve override null', () => {
  assert.equal(criarOverride(CATALOGO, ['nada', 'nem-isso'], 'fila', 1, T0, 'X'), null);
});

// --- pular na grade: nada de repetir episódio -------------------------------
// Cenário real do Lucas (29/07): ele pula o EP-A, assiste o EP-B inteiro e quer que a TV
// siga pro EP-C — sem voltar pro que pulou nem repetir o que acabou de ver.
const GRADE3 = [
  { inicio: '02:36', inicioMin: 156, duracaoMs: 22 * 60000, slug: 'a', serie: 'A', nome: 'EP-A', temporada: 1, episodio: 1, videoId: 'vA', editId: 'eA', intervalo: false },
  { inicio: '02:58', inicioMin: 178, duracaoMs: 12 * 60000, slug: 'b', serie: 'B', nome: 'EP-B', temporada: 1, episodio: 2, videoId: 'vB', editId: 'eB', intervalo: false },
  { inicio: '03:10', inicioMin: 190, duracaoMs: 12 * 60000, slug: 'c', serie: 'C', nome: 'EP-C', temporada: 1, episodio: 3, videoId: 'vC', editId: 'eC', intervalo: false },
];
const decG3 = (o) => decidir({ grade: GRADE3, catalogos: CATALOGO, ...o });

test('sem marcar nada, a grade volta pro programa do horário (comportamento base)', () => {
  const d = decG3({ minutosDia: 160, override: null, agoraMs: T0, consumidos: new Set() });
  assert.equal(d.entry.nome, 'EP-A');
});

test('pular: ao acabar o antecipado, NÃO volta pro episódio que foi pulado', () => {
  const consumidos = new Set([chaveExibicao(GRADE3[0]), chaveExibicao(GRADE3[1])]);
  const ov = { tipo: 'zap', slug: 'b', serie: 'B', seed: 0, atual: GRADE3[1], restante: [], iniciadoEm: T0 };
  const d = decG3({ minutosDia: 172, override: ov, agoraMs: T0 + 12 * 60000 + 1, consumidos });
  assert.equal(d.origem, 'grade');
  assert.equal(d.entry.nome, 'EP-C', 'devia seguir pro EP-C, não voltar pro EP-A pulado');
});

test('pular: no horário do episódio já assistido, NÃO repete', () => {
  const consumidos = new Set([chaveExibicao(GRADE3[0]), chaveExibicao(GRADE3[1])]);
  const d = decG3({ minutosDia: 179, override: null, agoraMs: T0, consumidos });
  assert.equal(d.entry.nome, 'EP-C', 'estava no horário do EP-B, que já foi assistido inteiro');
});

test('exibição adiantada vem marcada com adiantado:true (pro tv.js registrar)', () => {
  const consumidos = new Set([chaveExibicao(GRADE3[0])]);
  const d = decG3({ minutosDia: 160, override: null, agoraMs: T0, consumidos });
  assert.equal(d.entry.nome, 'EP-B');
  assert.equal(d.adiantado, true);
  assert.equal(d.offsetSeg, 0, 'programa adiantado toca do início');
});

test('grade toda consumida devolve entry nula em vez de repetir', () => {
  const consumidos = new Set(GRADE3.map(chaveExibicao));
  assert.equal(decG3({ minutosDia: 160, override: null, agoraMs: T0, consumidos }).entry, null);
});

test('chaveExibicao separa o mesmo episódio em horários diferentes', () => {
  const manha = { ...GRADE3[0], inicioMin: 156 };
  const tarde = { ...GRADE3[0], inicioMin: 800 };
  assert.notEqual(chaveExibicao(manha), chaveExibicao(tarde));
});

// --- utilitários ------------------------------------------------------------
test('embaralhar é determinístico por seed e preserva os itens', () => {
  const a = embaralhar([1, 2, 3, 4, 5], 99);
  assert.deepEqual(a, embaralhar([1, 2, 3, 4, 5], 99));
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5]);
});

test('montarFila é determinístico por seed', () => {
  const a = montarFila(CATALOGO, ['gumball', 'smiling'], 77).map((x) => x.slug + x.ep.nome);
  const b = montarFila(CATALOGO, ['gumball', 'smiling'], 77).map((x) => x.slug + x.ep.nome);
  assert.deepEqual(a, b);
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

test('decidir nunca muta o override que recebeu', () => {
  const ov = criarOverride(CATALOGO, 'dexter', 'fila', 7, T0);
  const copia = JSON.parse(JSON.stringify(ov));
  dec({ minutosDia: 365, override: ov, agoraMs: T0 + 40 * 60000 });
  assert.deepEqual(JSON.parse(JSON.stringify(ov)), copia, 'o override de entrada foi mutado');
});
