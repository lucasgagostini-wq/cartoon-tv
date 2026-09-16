const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { salvarRetomada, carregarRetomada, JANELA_MS } = require('./retomada');

const arq = path.join(os.tmpdir(), 'cartoontv-retomada-teste-' + process.pid + '.json');
const override = {
  tipo: 'fila', slugs: ['rick-e-morty', 'smiling-friends'], seed: 42, nome: 'Tarde da noite',
  atual: { slug: 'smiling-friends', serie: 'SMILING FRIENDS', nome: 'O Episódio Do Glep', temporada: 3, episodio: 8,
           videoId: 'v1', editId: 'e1', duracaoMs: 682000, inicio: '--:--', inicioMin: null, intervalo: false },
  restante: [{ slug: 'rick-e-morty', serie: 'Rick & Morty', ep: { videoId: 'v2', editId: 'e2', temporada: 5, episodio: 3, nome: 'x', duracaoMs: 1000 } }],
  iniciadoEm: 1000,
};
test.afterEach(() => { try { fs.unlinkSync(arq); } catch (e) {} });

test('salva e retoma dentro da janela: mesmo episódio, mesmo segundo, fila intacta', () => {
  salvarRetomada(arq, override, 196.7, 1_000_000);
  const r = carregarRetomada(arq, 1_000_000 + 20_000);
  assert.ok(r, 'devia retomar');
  assert.equal(r.decorridoSeg, 196);
  assert.equal(r.paradoSeg, 20);
  assert.equal(r.override.atual.videoId, 'v1');
  assert.deepEqual(r.override.restante, override.restante);
  assert.equal(r.override.nome, 'Tarde da noite');
  // iniciadoEm recalculado: o decidir() vai achar offset = 196s, não o de antes de desligar
  assert.equal(r.override.iniciadoEm, 1_000_000 + 20_000 - 196_000);
});

test('fora da janela (TV desligada há mais tempo) não retoma: vale a grade', () => {
  salvarRetomada(arq, override, 100, 1_000_000);
  assert.equal(carregarRetomada(arq, 1_000_000 + JANELA_MS + 1), null);
  assert.ok(carregarRetomada(arq, 1_000_000 + JANELA_MS - 1), 'no limite ainda retoma');
});

test('relógio que andou pra trás (salvoEm no futuro) não retoma', () => {
  salvarRetomada(arq, override, 100, 1_000_000);
  assert.equal(carregarRetomada(arq, 999_000), null);
});

test('override null (TV na grade / fila acabou) apaga o arquivo — não retoma fila velha', () => {
  salvarRetomada(arq, override, 100, 1_000_000);
  assert.ok(fs.existsSync(arq));
  assert.equal(salvarRetomada(arq, null, 0, 1_000_000), false);
  assert.ok(!fs.existsSync(arq));
  assert.equal(carregarRetomada(arq, 1_000_000), null);
});

test('arquivo corrompido ou sem override é ignorado, sem estourar', () => {
  fs.writeFileSync(arq, '{"salvoEm": 1, "override": {');
  assert.equal(carregarRetomada(arq, 2), null);
  fs.writeFileSync(arq, JSON.stringify({ salvoEm: 1, override: null }));
  assert.equal(carregarRetomada(arq, 2), null);
  fs.writeFileSync(arq, JSON.stringify({ salvoEm: 'ontem', override, decorridoSeg: 5 }));
  assert.equal(carregarRetomada(arq, 2), null);
});

test('decorrido inválido vira 0 (retoma do começo do episódio, não quebra)', () => {
  salvarRetomada(arq, override, NaN, 1_000_000);
  const r = carregarRetomada(arq, 1_000_000);
  assert.equal(r.decorridoSeg, 0);
  salvarRetomada(arq, override, -30, 1_000_000);
  assert.equal(carregarRetomada(arq, 1_000_000).decorridoSeg, 0);
});
