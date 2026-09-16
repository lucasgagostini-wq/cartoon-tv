const test = require('node:test');
const assert = require('node:assert');
const { casa, preferenciaDe, decidirCliques, mesmaPreferencia } = require('./idioma');

// rótulos REAIS lidos do player em 16/09/2026
const AUDIO = ['Inglês - Original', 'Português (Brasil)', 'Espanhol (América Latina)'];
const LEGENDA = ['Desativado', 'Português (Brasil)', 'Espanhol (América Latina)', 'Inglês'];
const faixas = (audioOn, legendaOn) => ({
  audio: AUDIO.map((r) => ({ rotulo: r, marcada: r === audioOn })),
  legenda: LEGENDA.map((r) => ({ rotulo: r, marcada: r === legendaOn })),
});
const CFG = {
  padrao: { audio: 'pt', legenda: 'off' },
  series: {
    'rick-e-morty': { audio: 'pt', legenda: 'off' },
    'smiling-friends': { audio: 'en', legenda: 'pt' },
  },
};

test('"Inglês - Original" é inglês, não português', () => {
  assert.equal(casa('Inglês - Original', 'en'), true);
  assert.equal(casa('Inglês - Original', 'pt'), false);
  assert.equal(casa('Português (Brasil)', 'pt'), true);
  assert.equal(casa('Desativado', 'off'), true);
});

test('preferência da série vence o padrão; série sem regra cai no padrão', () => {
  assert.deepEqual(preferenciaDe(CFG, 'smiling-friends'), { audio: 'en', legenda: 'pt' });
  assert.deepEqual(preferenciaDe(CFG, 'apenas-um-show'), { audio: 'pt', legenda: 'off' });
  assert.equal(preferenciaDe({}, 'x'), null);
});

test('Rick and Morty com o player em inglês+legenda (vazado do Smiling Friends): clica nos dois', () => {
  const d = decidirCliques(faixas('Inglês - Original', 'Inglês'), preferenciaDe(CFG, 'rick-e-morty'));
  assert.equal(d.audio.idx, 1);          // Português (Brasil)
  assert.equal(d.legenda.idx, 0);        // Desativado
});

test('já está no idioma certo: não clica em nada (não abre menu à toa)', () => {
  const d = decidirCliques(faixas('Português (Brasil)', 'Desativado'), preferenciaDe(CFG, 'rick-e-morty'));
  assert.equal(d.audio, null);
  assert.equal(d.legenda, null);
});

test('Smiling Friends: inglês com legenda em português', () => {
  const d = decidirCliques(faixas('Português (Brasil)', 'Desativado'), preferenciaDe(CFG, 'smiling-friends'));
  assert.equal(d.audio.rotulo, 'Inglês - Original');
  assert.equal(d.legenda.rotulo, 'Português (Brasil)');
});

test('episódio sem a faixa pedida: reporta erro em vez de clicar em qualquer uma', () => {
  const so_ingles = { audio: [{ rotulo: 'Inglês - Original', marcada: true }], legenda: [{ rotulo: 'Desativado', marcada: true }] };
  const d = decidirCliques(so_ingles, { audio: 'pt', legenda: 'off' });
  assert.equal(d.audio.idx, null);
  assert.match(d.audio.erro, /sem faixa pt/);
  assert.equal(d.legenda, null);
});

test('lista vazia (menu não abriu) não vira clique', () => {
  const d = decidirCliques({ audio: [], legenda: [] }, { audio: 'pt', legenda: 'off' });
  assert.equal(d.audio, null);
  assert.equal(d.legenda, null);
});

test('mesmaPreferencia: a do Max é global, então série igual dispensa reaplicar', () => {
  assert.equal(mesmaPreferencia({ audio: 'pt', legenda: 'off' }, { audio: 'pt', legenda: 'off' }), true);
  assert.equal(mesmaPreferencia({ audio: 'pt', legenda: 'off' }, { audio: 'en', legenda: 'pt' }), false);
  assert.equal(mesmaPreferencia(null, { audio: 'pt', legenda: 'off' }), false);
});
