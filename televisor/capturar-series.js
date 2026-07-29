// Captura o catálogo completo: pra cada série, abre a página no Max, itera as
// temporadas no dropdown e colhe TODOS os episódios (nome, SxE, duração, ids)
// interceptando as respostas JSON da API. Saída: emissora/catalogo/<slug>.json
// Uso: node capturar-series.js            -> captura todas as séries da LISTA
//      node capturar-series.js <slug>     -> só uma (pra depurar)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

// Duplicatas propositais (mesmo nome no catálogo): capturamos os dois IDs e o
// gerador de catálogo decide depois pelo ano (original vs reboot).
const LISTA = [
  ['dexter', '0f292408-bfdd-4d2d-9de1-b531bc85cbb3', 'O Laboratório de Dexter'],
  ['meninas-a', '3365f7bf-14b5-4982-9c1e-dbdd6f08770e', 'As Meninas Superpoderosas (id A)'],
  ['meninas-b', '642fcd3e-49ae-457c-a512-8d8bef1d1cef', 'As Meninas Superpoderosas (id B)'],
  ['johnny-bravo', '36783270-f344-487e-b98b-36337db5dea0', 'Johnny Bravo'],
  ['coragem', '7768bbde-9895-494b-8469-bd7ff909ac64', 'Coragem, o Cão Covarde'],
  ['du-dudu-edu', 'f33ea1b0-72ef-4a9d-b53e-786aeaaa84bb', 'Du, Dudu e Edu'],
  ['mansao-foster', 'caec9e0f-0ebe-4b80-9bf4-4bd1836c7ff6', 'A Mansão Foster para Amigos Imaginários'],
  ['samurai-jack', '3e782d6a-3f32-4494-af91-9110dd9ec558', 'Samurai Jack'],
  ['hora-de-aventura', 'fff09eaf-17c3-446b-be32-8a0d47e4ccf1', 'Hora De Aventura'],
  ['apenas-um-show', '1ce7cec4-c452-465a-89f6-0f50e613f9d0', 'Apenas Um Show'],
  ['fitas-perdidas', 'a7dc956b-41da-4eef-b414-56acae63d895', 'Apenas Um Show: As Fitas Perdidas'],
  ['gumball', '18ad0649-f2dd-410d-8842-2ba2aa486fdb', 'O Incrível Mundo de Gumball'],
  ['gumball-novo', '27b214cf-dbe5-49c8-9a99-43d4dc5989dd', 'O Mundo Maravilhosamente Estranho de Gumball'],
  ['flapjack', '6f1381c9-9946-4f8c-9267-de1fddbac365', 'As Trapalhadas de Flapjack'],
  ['titio-avo', 'aaaa220b-b1d9-4d94-81ef-2bdee53c7e76', 'Titio Avô'],
  ['clarencio', 'bbf38e08-8288-4594-88e3-e982a0dbf809', 'Clarêncio, o Otimista'],
  ['ben10-a', '78b6fa0c-47c4-4fdf-ad77-67a407efd900', 'Ben 10 (id A)'],
  ['ben10-b', 'dbc70117-eb41-4d3f-8fd0-adcff8cb9481', 'Ben 10 (id B)'],
  ['ben10-forca-alienigena', '9432fc7f-94db-4047-872f-a7f8f0849a37', 'Ben 10: Força Alienígena'],
  ['looney-tunes-cartoons', 'e90f1b95-4825-4f3d-bbe2-4cbc82dc7229', 'Looney Tunes Cartoons'],
  ['outra-semana-no-cartoon', '7cb672ac-c8eb-4451-978f-9f110804052c', 'Outra Semana No Cartoon'],
  ['terras-distantes', '9141a8ca-0a07-4278-9488-1f7776597ed6', 'Hora De Aventura: Terras Distantes'],
  ['fionna-e-cake', 'ec92dad5-265d-4b09-a27e-c7f7629cdfc3', 'Hora de Aventura com Fionna e Cake'],
  ['rick-e-morty', 'ab553cdc-e15d-4597-b65f-bec9201fd2dd', 'Rick & Morty'],
  ['smiling-friends', 'b692705b-2f12-4a3d-ab4d-579124e0667c', 'SMILING FRIENDS'],
  ['primal', '59dc1d55-bb08-4bb4-85dd-d03e64f4fef1', 'Primal'],
  ['chowder', '45347815-a950-4ed0-bf02-8b6297f672d2', 'Chowder'],
  ['billy-e-mandy', '0fd9938a-862b-466d-999e-c4ece1d56e0c', 'As Terríveis Aventuras de Billy e Mandy'],
  // Não é da Cartoon, mas o Lucas pediu na grade geral (29/07)
  ['bob-esponja', '6237f381-2ab7-41ca-8e73-e177033de02f', 'Bob Esponja, Calça Quadrada'],
];

const OUT_DIR = path.join(__dirname, '..', 'emissora', 'catalogo');
const soSlug = process.argv[2] || null;

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '.chrome-profile'), {
    channel: 'chrome', headless: false, viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  // Colheita passiva: cada resposta da CMS alimenta os mapas da série corrente
  let colheita = null;
  page.on('response', async (res) => {
    try {
      if (!colheita || !res.url().includes('/cms/')) return;
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const j = await res.json();
      const entidades = [...(j.included || []), ...(Array.isArray(j.data) ? j.data : [j.data])].filter(Boolean);
      const edits = colheita.edits, videos = colheita.videos, temporadas = colheita.temporadas;
      for (const e of entidades) {
        if (e.type === 'edit') edits[e.id] = (e.attributes || {}).duration;
        else if (e.type === 'video') {
          const a = e.attributes || {};
          if (a.videoType !== 'EPISODE') continue;
          const editId = (((e.relationships || {}).edit || {}).data || {}).id || null;
          const showId = (((e.relationships || {}).show || {}).data || {}).id || null;
          videos[e.id] = {
            videoId: e.id, editId, showId,
            nome: a.name || '', temporada: a.seasonNumber ?? null, episodio: a.episodeNumber ?? null,
            airDate: a.airDate || null,
          };
        } else if (e.type === 'season') {
          const a = e.attributes || {};
          const showId = (((e.relationships || {}).show || {}).data || {}).id || null;
          temporadas[e.id] = { numero: a.seasonNumber ?? null, nome: a.name || '', showId };
        }
      }
    } catch (e) { /* respostas parciais — ignora */ }
  });

  // Tela de perfil (1ª navegação)
  await page.goto('https://play.hbomax.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  try {
    const prof = page.getByText('Lucas', { exact: true }).first();
    if (await prof.isVisible({ timeout: 2500 })) { await prof.click(); await page.waitForTimeout(4000); }
  } catch (e) { /* sem tela de perfil */ }

  const resumo = [];
  for (const [slug, showId, nomeOficial] of LISTA) {
    if (soSlug && slug !== soSlug) continue;
    // Retomável: pula o que já foi capturado (rode de novo pra continuar de onde parou)
    if (!soSlug && fs.existsSync(path.join(OUT_DIR, slug + '.json'))) {
      console.log(slug + ': já capturado, pulando');
      continue;
    }
    colheita = { edits: {}, videos: {}, temporadas: {} };
    const inicio = Date.now();
    try {
      await page.goto('https://play.hbomax.com/show/' + showId, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000);

      // Itera temporadas pelo dropdown (se existir; série de 1 temporada não tem).
      // Sondado 28/07: toggle dentro de [..._dropdown]; opções em
      // [data-testid="drop-down-menu"] [role="option"] com texto "Temporada N".
      // Clique via DOM — clique de mouse cai nos tiles e abre menu de episódio.
      const abrirDropdown = () => page.evaluate(() => {
        const c = document.querySelector('[data-testid$="_dropdown"]');
        const b = c && (c.querySelector('[data-testid="dropdownToggleButton"]') || c.querySelector('button'));
        if (!b) return false;
        b.click();
        return true;
      });
      let opcoes = [];
      try {
        if (await abrirDropdown()) {
          await page.waitForTimeout(1000);
          opcoes = await page.evaluate(() =>
            [...document.querySelectorAll('[data-testid="drop-down-menu"] [role="option"]')]
              .map((o) => (o.textContent || '').replace(/[⁦-⁩]/g, '').trim()).filter(Boolean));
          await page.keyboard.press('Escape');
          await page.waitForTimeout(600);
        }
      } catch (e) { /* sem dropdown */ }

      for (const rotulo of opcoes) {
        let ok = false;
        for (let tentativa = 1; tentativa <= 3 && !ok; tentativa++) {
          try {
            await abrirDropdown();
            await page.waitForTimeout(900 * tentativa);
            ok = await page.evaluate((alvo) => {
              const op = [...document.querySelectorAll('[data-testid="drop-down-menu"] [role="option"]')]
                .find((o) => (o.textContent || '').replace(/[⁦-⁩]/g, '').trim() === alvo);
              if (!op) return false;
              op.click();
              return true;
            }, rotulo);
            if (ok) await page.waitForTimeout(3500); // tempo da API responder e a colheita pegar
            else { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
          } catch (e) {
            try { await page.keyboard.press('Escape'); } catch (e2) {}
          }
        }
        if (!ok) console.log('  ' + slug + ': opção não achada após retries: ' + rotulo);
      }

      // Monta episódios: só vídeos desta série (ou sem showId — assume corrente)
      const eps = Object.values(colheita.videos)
        .filter((v) => !v.showId || v.showId === showId)
        .map((v) => ({ ...v, duracaoMs: colheita.edits[v.editId] ?? null }))
        .sort((a, b) => (a.temporada - b.temporada) || (a.episodio - b.episodio));
      const arquivo = path.join(OUT_DIR, slug + '.json');
      fs.writeFileSync(arquivo, JSON.stringify({
        slug, showId, nomeOficial, capturadoEm: new Date().toISOString(),
        temporadasDropdown: opcoes, episodios: eps,
      }, null, 2));
      const linha = slug + ': ' + eps.length + ' eps, ' + opcoes.length + ' temporadas no dropdown, ' +
        Math.round((Date.now() - inicio) / 1000) + 's';
      console.log(linha);
      resumo.push(linha);
    } catch (e) {
      const linha = slug + ': ERRO ' + e.message.slice(0, 120);
      console.log(linha);
      resumo.push(linha);
      try { await page.screenshot({ path: path.join(OUT_DIR, slug + '-erro.png') }); } catch (e2) {}
    }
    colheita = null;
  }

  fs.writeFileSync(path.join(OUT_DIR, '_resumo.txt'), resumo.join('\n'));
  console.log('FIM. ' + resumo.length + ' séries processadas.');
  await ctx.close();
})().catch((e) => { console.error('ERRO FATAL: ' + e.message); process.exit(1); });
