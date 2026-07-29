// Configuração da instalação (nome do perfil do streaming, etc).
// Fica FORA do git: cada pessoa tem a sua. Ausente = a TV usa os padrões.
const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, 'configuracao.json');

function ler() {
  try { return JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')) || {}; }
  catch (e) { return {}; }
}

function gravar(cfg) {
  try { fs.writeFileSync(ARQUIVO, JSON.stringify(cfg, null, 2)); return true; }
  catch (e) { return false; }
}

// Clica no perfil configurado, se houver tela de perfis. Sem config, não clica em nada:
// o Max costuma entrar direto no último perfil usado, e chutar um nome que não existe
// só gastaria tempo. (Antes o nome "Lucas" estava fixo no código — na máquina de outra
// pessoa isso nunca funcionaria.)
async function escolherPerfil(page, log) {
  const nome = ler().perfil;
  if (!nome) return false;
  try {
    const prof = page.getByText(nome, { exact: true }).first();
    if (await prof.isVisible({ timeout: 2500 })) {
      await prof.click();
      await page.waitForTimeout(3000);
      return true;
    }
  } catch (e) { if (log) log('perfil "' + nome + '" não apareceu — seguindo'); }
  return false;
}

module.exports = { ler, gravar, escolherPerfil, ARQUIVO };
