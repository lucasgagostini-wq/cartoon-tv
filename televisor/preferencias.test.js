const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { lerVolume, gravarVolume } = require('./preferencias');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cttv-')), 'preferencias.json');

test('sem arquivo, lerVolume devolve null (a TV nao deve mexer em nada)', () => {
  assert.equal(lerVolume(tmp()), null);
});

test('grava e le o mesmo volume', () => {
  const f = tmp();
  assert.equal(gravarVolume(f, 0.35), true);
  assert.equal(lerVolume(f), 0.35);
});

test('arquivo corrompido nao explode, devolve null', () => {
  const f = tmp();
  fs.writeFileSync(f, '{isso nao e json');
  assert.equal(lerVolume(f), null);
});

test('volume fora de 0..1 e recusado na gravacao', () => {
  const f = tmp();
  assert.equal(gravarVolume(f, 5), false);
  assert.equal(lerVolume(f), null);
});

test('volume 0 (mudo) e valido e nao vira null', () => {
  const f = tmp();
  gravarVolume(f, 0);
  assert.equal(lerVolume(f), 0);
});

test('gravar em caminho invalido devolve false sem explodir', () => {
  assert.equal(gravarVolume(path.join(os.tmpdir(), 'nao', 'existe', 'p.json'), 0.5), false);
});
