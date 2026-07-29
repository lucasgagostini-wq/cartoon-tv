// O teste que importa neste port: a grade da EXTENSÃO tem que ser byte a byte igual à da
// emissora. Se divergir, a extensão vira outro canal — mesma hora, outro desenho.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gerarAte, agoraInfo } from './grade.js';

const require = createRequire(import.meta.url);
const RAIZ = path.join(import.meta.dirname, '..', '..');
const { gerarAte: gerarAteNode } = require(path.join(RAIZ, 'emissora', 'gerar-grade.js'));

const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'extensao', 'dados', 'catalogo.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(RAIZ, 'extensao', 'dados', 'canal.json'), 'utf8'));

const DIAS = ['2026-07-27', '2026-07-28', '2026-07-29', '2026-08-05', '2026-09-14'];

for (const dia of DIAS) {
  test('grade da extensão == grade da emissora em ' + dia, () => {
    const daExtensao = gerarAte(dia, config, catalogo);
    const { grade: daEmissora } = gerarAteNode(dia);
    assert.equal(daExtensao.length, daEmissora.length, 'número de exibições diferente');
    for (let i = 0; i < daEmissora.length; i++) {
      const a = daExtensao[i], b = daEmissora[i];
      assert.equal(a.inicio + a.videoId, b.inicio + b.videoId,
        'divergiu na exibição ' + i + ': ' + a.inicio + ' ' + a.slug + ' vs ' + b.inicio + ' ' + b.slug);
    }
  });
}

test('gerarAte é determinístico (duas chamadas, mesmo resultado)', () => {
  const a = gerarAte('2026-07-29', config, catalogo);
  const b = gerarAte('2026-07-29', config, catalogo);
  assert.deepEqual(a, b);
});

test('agoraInfo joga a madrugada pro dia de programação anterior', () => {
  const madrugada = new Date(2026, 6, 29, 2, 30, 0);   // 29/07 02:30
  const info = agoraInfo(madrugada);
  assert.equal(info.diaStr, '2026-07-28', 'às 02:30 vale a grade do dia anterior');
  assert.ok(info.minutos > 24 * 60, 'minutos passam de 1440 pra madrugada');
});

test('agoraInfo de tarde usa o próprio dia', () => {
  const info = agoraInfo(new Date(2026, 6, 29, 15, 0, 0));
  assert.equal(info.diaStr, '2026-07-29');
  assert.equal(info.minutos, 900);
});

test('o catálogo empacotado tem as séries da grade', () => {
  const slugs = new Set(config.faixas.flatMap((f) => f.series.map((s) => (typeof s === 'string' ? s : s.slug))));
  const faltando = [...slugs].filter((s) => !catalogo[s]);
  assert.deepEqual(faltando, [], 'séries na grade sem catálogo empacotado');
});
