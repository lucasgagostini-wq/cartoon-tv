// Retomada da fila depois de religar a TV.
//
// A grade volta sozinha pelo relógio (é o ponto do canal linear). A fila não: playlist, "ver agora"
// e fila aleatória só existiam em estado.override, na memória — religar perdia o episódio, o
// segundo e a ordem sorteada (15/09/2026: Lucas no meio de um Smiling Friends). Aqui o override
// vai pro disco a cada tick e, se a TV religar dentro da janela, volta no MESMO episódio e segundo:
// semântica de pausa, não de relógio — o que ele estava vendo não anda enquanto a TV está desligada.
// Regra de ouro: sem Playwright, sem grade; só JSON num arquivo.
const fs = require('fs');

const JANELA_MS = 15 * 60 * 1000; // religou em até 15 min = continua; mais que isso, vale a grade

// override null (TV na grade, ou fila acabou) => apaga o arquivo, pra não retomar fila velha.
function salvarRetomada(arq, override, decorridoSeg, agoraMs = Date.now()) {
  if (!override) { try { fs.unlinkSync(arq); } catch (e) {} return false; }
  const conteudo = JSON.stringify({
    salvoEm: agoraMs,
    decorridoSeg: Math.max(0, Math.floor(Number(decorridoSeg) || 0)),
    override,
  });
  const tmp = arq + '.tmp';
  fs.writeFileSync(tmp, conteudo);
  fs.renameSync(tmp, arq); // troca atômica: religar no meio de uma gravação nunca lê JSON pela metade
  return true;
}

// Devolve { override (com iniciadoEm recalculado), decorridoSeg, paradoSeg } ou null.
function carregarRetomada(arq, agoraMs = Date.now(), janelaMs = JANELA_MS) {
  let j;
  try { j = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { return null; }
  if (!j || !j.override || !j.override.atual || typeof j.salvoEm !== 'number') return null;
  const paradoMs = agoraMs - j.salvoEm;
  if (paradoMs < 0 || paradoMs > janelaMs) return null;
  const decorridoSeg = Math.max(0, Math.floor(Number(j.decorridoSeg) || 0));
  return {
    override: { ...j.override, iniciadoEm: agoraMs - decorridoSeg * 1000 },
    decorridoSeg,
    paradoSeg: Math.round(paradoMs / 1000),
  };
}

module.exports = { salvarRetomada, carregarRetomada, JANELA_MS };
