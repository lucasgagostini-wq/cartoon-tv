// Volume que o Lucas deixou. Existe porque o tv.js forçava volume = 1 a cada troca:
// a TV abria no máximo mesmo com a HUD do Max mostrando outro valor.
const fs = require('fs');

function lerVolume(arquivo) {
  try {
    const j = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const v = Number(j.volume);
    return (v >= 0 && v <= 1) ? v : null;
  } catch (e) { return null; }
}

function gravarVolume(arquivo, v) {
  if (!(v >= 0 && v <= 1)) return false;
  try { fs.writeFileSync(arquivo, JSON.stringify({ volume: v }, null, 2)); return true; }
  catch (e) { return false; }
}

module.exports = { lerVolume, gravarVolume };
