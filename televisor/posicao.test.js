const test = require('node:test');
const assert = require('node:assert');
const { precisaSeek } = require('./posicao');

test('fila começando do zero, Max retomou aos 2min10 (episódio pulado dias antes): corrige', () => {
  assert.equal(precisaSeek(130, 0), true);
});

test('fila do zero, Max retomou aos 16s (pulado logo no começo): corrige também', () => {
  assert.equal(precisaSeek(16, 0), true);
});

test('fila do zero, player nos primeiros segundos (leitura normal): não mexe', () => {
  assert.equal(precisaSeek(0.6, 0), false);
  assert.equal(precisaSeek(1.8, 0), false);
  assert.equal(precisaSeek(4.9, 0), false);
});

test('grade entrando aos 20min, player já perto disso: não mexe (folga de 20s)', () => {
  assert.equal(precisaSeek(1205, 1200), false);
  assert.equal(precisaSeek(1185, 1200), false);
});

test('grade entrando aos 20min, Max abriu do zero ou em outra marca: corrige', () => {
  assert.equal(precisaSeek(0.7, 1200), true);
  assert.equal(precisaSeek(300, 1200), true);
});

test('entrada curta (até 15s) usa a folga apertada, como começo do zero', () => {
  assert.equal(precisaSeek(40, 10), true);
  assert.equal(precisaSeek(12, 10), false);
});

test('leitura inválida não dispara seek', () => {
  assert.equal(precisaSeek(NaN, 0), false);
  assert.equal(precisaSeek(undefined, 0), false);
  assert.equal(precisaSeek(10, -1), false);
});
