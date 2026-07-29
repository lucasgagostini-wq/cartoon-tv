const test = require('node:test');
const assert = require('node:assert');
const { decidir, criarOverride, embaralhar, entryDeEpisodio } = require('./fila');

// --- fixtures ---------------------------------------------------------------
const ep = (n, t, e, min) => ({ nome: n, temporada: t, episodio: e, duracaoMs: min * 60000,
  videoId: 'vid-' + n, editId: 'ed-' + n });

const CATALOGO = {
  dexter: { slug: 'dexter', nome: 'O Laboratório de Dexter',
    episodios: [ep('A', 1, 1, 11), ep('B', 1, 2, 11), ep('C', 1, 3, 11), ep('D', 1, 4, 11)] },
  coragem: { slug: 'coragem', nome: 'Coragem', episodios: [ep('X', 1, 1, 22)] },
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
  assert.equal(d.offsetSeg, 300);          // 5 min depois das 06:00
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

// --- fila aleatória ---------------------------------------------------------
test('fila emenda o próximo sorteado quando o episódio acaba', () => {
  const ov = criarOverride(CATALOGO, 'dexter', 'fila', 42, T0);
  const primeiro = ov.atual.nome;
  const d = dec({ minutosDia: 372, override: ov, agoraMs: T0 + 12 * 60000 });
  assert.equal(d.origem, 'fila');
  assert.notEqual(d.entry.nome, primeiro);
  assert.equal(d.offsetSeg, 60);   // 12min de relógio - 11min do episódio anterior
  assert.equal(d.fila.serie, 'O Laboratório de Dexter');
});

test('fila não repete episódio antes de esgotar a série', () => {
  let ov = criarOverride(CATALOGO, 'dexter', 'fila', 7, T0);
  const vistos = [ov.atual.nome];
  let t = T0;
  for (let i = 0; i < 3; i++) {
    t += 12 * 60000;
    const d = dec({ minutosDia: 365, override: ov, agoraMs: t });
    ov = d.override;
    vistos.push(d.entry.nome);
  }
  assert.equal(new Set(vistos).size, 4, 'os 4 episódios deviam sair sem repetir: ' + vistos.join(','));
});

test('fila esgotada reembaralha e continua, sem voltar pra grade', () => {
  let ov = criarOverride(CATALOGO, 'dexter', 'fila', 7, T0);
  let t = T0, d;
  for (let i = 0; i < 4; i++) { t += 12 * 60000; d = dec({ minutosDia: 365, override: ov, agoraMs: t }); ov = d.override; }
  assert.equal(d.origem, 'fila');
  assert.ok(d.entry, 'devia continuar tocando dexter');
  assert.equal(d.entry.slug, 'dexter');
});

test('série de um episódio só não trava a fila', () => {
  const ov = criarOverride(CATALOGO, 'coragem', 'fila', 3, T0);
  const d = dec({ minutosDia: 365, override: ov, agoraMs: T0 + 23 * 60000 });
  assert.equal(d.origem, 'fila');
  assert.equal(d.entry.slug, 'coragem');
});

// --- utilitários ------------------------------------------------------------
test('embaralhar é determinístico por seed e preserva os itens', () => {
  const a = embaralhar([1, 2, 3, 4, 5], 99);
  const b = embaralhar([1, 2, 3, 4, 5], 99);
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5]);
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
