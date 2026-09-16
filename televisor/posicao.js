// Posição do vídeo: a TV manda, não a marca "continuar assistindo" do HBO Max.
//
// O Max abre cada episódio onde a conta parou da última vez — inclusive um que o Lucas PULOU no meio
// dias atrás. Na grade a TV já corrigia (entra no meio, pelo relógio), mas episódio de fila começa do
// zero e a correção antiga só rodava com seg > 15: a fila nascia "no meio de nada" (15/09/2026).
//
// seg   = onde a grade/fila quer o episódio (segundos).
// tempo = currentTime lido do player assim que ele confirmou que está rodando.
const TOL_MEIO = 20;  // entrando no meio: o seek do Max não é exato, 20s de folga (regra antiga)
const TOL_INICIO = 5; // começando do zero: o player é lido em <2s; qualquer coisa além disso é marca do Max

function precisaSeek(tempo, seg) {
  if (!(tempo >= 0) || !(seg >= 0)) return false;
  const tol = seg > 15 ? TOL_MEIO : TOL_INICIO;
  return Math.abs(tempo - seg) > tol;
}

module.exports = { precisaSeek, TOL_MEIO, TOL_INICIO };
