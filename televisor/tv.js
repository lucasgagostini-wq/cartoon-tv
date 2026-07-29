// A TV: abre o Chrome no HBO Max e toca a grade do dia como um canal linear.
// - Liga no programa do momento, já no minuto certo (como TV de verdade)
// - Troca de episódio pelo RELÓGIO DA GRADE (não confia no autoplay do Max)
// - Se o Max fizer autoplay pro episódio errado, corrige na hora
// - Se o player travar, recarrega e volta pro ponto
// Uso: node tv.js          (Ctrl+C ou fechar a janela = desligar)
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const { gerarAte, carregarCatalogos } = require('../emissora/gerar-grade');
const { INIT_SCRIPT, faixaDoMinuto } = require('./vinheta');
const { decidir, criarOverride, chaveExibicao } = require('./fila');
const { iniciarControle } = require('./controle-servidor');
const { lerVolume, gravarVolume } = require('./preferencias');
const { escolherPerfil } = require('./configuracao');

const TICK_MS = 5000;
const PORTA_CONTROLE = 4599;
const ARQ_PREF = path.join(__dirname, 'preferencias.json');

function agoraInfo() {
  // Dia de programação começa 06:00; antes disso vale a grade de ontem
  const agora = new Date();
  let diaProg = new Date(agora);
  let minutos = agora.getHours() * 60 + agora.getMinutes() + agora.getSeconds() / 60;
  if (agora.getHours() < 6) { diaProg = new Date(agora.getTime() - 86400000); minutos += 24 * 60; }
  const diaStr = diaProg.getFullYear() + '-' + String(diaProg.getMonth() + 1).padStart(2, '0') + '-' + String(diaProg.getDate()).padStart(2, '0');
  return { diaStr, minutos };
}

// Estado vivo da TV. É a ÚNICA coisa que o servidor de controle lê — ele nunca fala
// com o Playwright. Por isso /estado responde instantâneo e não pesa no player.
const estado = {
  ligada: false, override: null, origem: 'grade',
  entry: null, iniciadoEmMs: 0, trocouEmMs: 0,
  ultimoTempoVideo: 0, ultimaLeituraMs: 0,
  volume: null, videosNaPagina: 0,
  proximos: [],
  // exibições da grade que já foram ao ar fora do horário, ou que o Lucas pulou.
  // Zera quando vira o dia de programação (senão a grade de amanhã nasceria furada).
  consumidos: new Set(), diaConsumidos: null,
};
const catalogos = carregarCatalogos();
let resolverComando = null; // acordado pelo POST /comando

// Playlists: filas que alternam entre várias séries. Editáveis pelo controle OU direto em
// emissora/playlists.json; um arquivo quebrado não pode impedir a TV de ligar.
const ARQ_PLAYLISTS = path.join(__dirname, '..', 'emissora', 'playlists.json');

function carregarPlaylists() {
  try {
    const j = JSON.parse(fs.readFileSync(ARQ_PLAYLISTS, 'utf8'));
    return (j.playlists || []).filter((p) => p.id && p.nome && Array.isArray(p.series));
  } catch (e) { return []; }
}
let playlists = carregarPlaylists();

function gravarPlaylists() {
  const conteudo = {
    _comentario: 'Playlists do Lucas. Cada uma vira uma fila aleatoria que ALTERNA entre as series: nenhuma domina, mesmo tendo 10x mais episodios que a outra. Editavel pelo controle remoto ou aqui na mao (os slugs sao os nomes dos arquivos em emissora/catalogo/).',
    playlists,
  };
  try { fs.writeFileSync(ARQ_PLAYLISTS, JSON.stringify(conteudo, null, 2)); return true; }
  catch (e) { log('⚠️ não consegui gravar playlists.json: ' + e.message); return false; }
}

// slug legível e estável a partir do nome, sem colidir com playlist existente
function idDeNome(nome, ignorarId) {
  const base = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'playlist';
  let id = base, n = 2;
  while (playlists.some((p) => p.id === id && p.id !== ignorarId)) id = base + '-' + n++;
  return id;
}

function programaAtual() {
  const { diaStr, minutos } = agoraInfo();
  const { grade } = gerarAte(diaStr);
  if (estado.diaConsumidos !== diaStr) { estado.consumidos = new Set(); estado.diaConsumidos = diaStr; }
  const d = decidir({ grade, minutosDia: minutos, override: estado.override, agoraMs: Date.now(),
    catalogos, consumidos: estado.consumidos });
  estado.override = d.override;
  estado.origem = d.origem;
  if (!d.entry) return null;
  // Programa da grade tocado ANTES da hora não pode tocar de novo no horário dele.
  if (d.origem === 'grade' && d.adiantado) estado.consumidos.add(chaveExibicao(d.entry));
  estado.proximos = d.origem === 'grade'
    ? grade.filter((g) => g.inicioMin > d.entry.inicioMin).slice(0, 5)
    : grade.filter((g) => g.inicioMin > minutos).slice(0, 5);
  return { entry: d.entry, offsetSeg: d.offsetSeg, proximo: d.proximo };
}

const urlDe = (g) => 'https://play.hbomax.com/video/watch/' + g.videoId + '/' + g.editId;
const log = (m) => console.log('[' + new Date().toTimeString().slice(0, 8) + '] ' + m);

(async () => {
  // Mede o que faltava: abrir o Chrome com o perfil de ~510 MB é a maior parte do tempo
  // entre clicar no atalho e a TV aparecer, e não estava em lugar nenhum do log.
  const t0Processo = Date.now();
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '.chrome-profile'), {
    channel: 'chrome', headless: false, viewport: null,
    // ignoreDefaultArgs: sem isso o Playwright passa --disable-component-update
    // e o Widevine não registra => "Sistema DRM não compatível" (28/07)
    ignoreDefaultArgs: ['--disable-component-update'],
    // --app: janela SEM abas e SEM barra de endereço, mas ainda é janela normal do
    // Windows (arrasta, redimensiona, F11 pra tela cheia). Medido 29/07: tira 56px
    // de UI vs janela comum; sobra só a barra de título.
    // O Chrome guarda o tamanho/posição dessa janela no perfil, então o que o Lucas
    // ajustar na mão volta igual na próxima vez que ligar.
    args: [
      '--app=https://play.hbomax.com/',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=Translate', // popup de tradução aparecia por cima do vídeo
    ],
  });
  await ctx.addInitScript(INIT_SCRIPT); // vinheta cobre o carregamento de cada troca
  const page = ctx.pages()[0] || (await ctx.newPage());
  let desligada = false;
  let fimLimpo = false; // true = janela fechada; false = saiu por erro
  ctx.on('close', () => { desligada = true; fimLimpo = true; estado.ligada = false; });

  // --- controle remoto -------------------------------------------------------
  // Porta ocupada não pode derrubar a TV: avisa e segue sem controle.
  const servidorControle = iniciarControle({
    porta: PORTA_CONTROLE,
    obterEstado: () => {
      if (!estado.ligada || !estado.entry) return { ligada: false };
      const e = estado.entry;
      const decorrido = estado.ultimaLeituraMs
        ? estado.ultimoTempoVideo + (Date.now() - estado.ultimaLeituraMs) / 1000
        : (Date.now() - estado.iniciadoEmMs) / 1000;
      const durSeg = e.duracaoMs / 1000;
      const emFila = !!(estado.override && estado.override.tipo === 'fila');
      return {
        ligada: true, origem: estado.origem,
        volume: estado.volume, videosNaPagina: estado.videosNaPagina,
        fila: emFila ? { serie: estado.override.nome, restantes: estado.override.restante.length } : null,
        agora: {
          serie: e.serie, nome: e.nome, temporada: e.temporada, episodio: e.episodio, inicio: e.inicio,
          duracaoSeg: Math.round(durSeg),
          decorridoSeg: Math.max(0, Math.min(Math.round(durSeg), Math.round(decorrido))),
          restanteSeg: Math.max(0, Math.round(durSeg - decorrido)),
        },
        // Em fila, o "a seguir" mostra a fila sorteada — nunca a grade, senão a
        // janelinha mostraria uma coisa e a TV tocaria outra.
        aSeguir: emFila
          ? estado.override.restante.slice(0, 5).map((it) => ({
              hora: '--:--', serie: it.serie,
              te: 'T' + it.ep.temporada + 'E' + it.ep.episodio, intervalo: false }))
          : estado.proximos.map((g) => ({
              hora: g.inicio, serie: g.serie,
              te: 'T' + g.temporada + 'E' + g.episodio, intervalo: !!g.intervalo })),
      };
    },
    obterSeries: () => Object.values(catalogos)
      .map((c) => ({ slug: c.slug, nome: c.nome, eps: c.episodios.length }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    obterPlaylists: () => playlists.map((p) => ({
      id: p.id, nome: p.nome,
      slugs: p.series.filter((s) => catalogos[s]),          // pro controle marcar os chips ao editar
      series: p.series.filter((s) => catalogos[s]).map((s) => catalogos[s].nome),
      eps: p.series.reduce((n, s) => n + (catalogos[s] ? catalogos[s].episodios.length : 0), 0),
    })),

    // Salvar/excluir playlist pelo controle. Grava no mesmo playlists.json que dá pra
    // editar na mão — a interface é só um jeito mais rápido de mexer no arquivo.
    salvarPlaylist: ({ id, nome, series }) => {
      const limpo = (series || []).filter((s) => catalogos[s]);
      if (!limpo.length) return { ok: false, erro: 'escolha ao menos uma serie' };
      const titulo = (nome || '').trim();
      if (!titulo) return { ok: false, erro: 'a playlist precisa de um nome' };
      const existente = id ? playlists.find((p) => p.id === id) : null;
      if (existente) {
        existente.nome = titulo; existente.series = limpo;
      } else {
        playlists.push({ id: idDeNome(titulo), nome: titulo, series: limpo });
      }
      if (!gravarPlaylists()) return { ok: false, erro: 'nao consegui gravar o arquivo' };
      log('Playlist salva: ' + titulo + ' (' + limpo.length + ' séries)');
      return { ok: true };
    },
    excluirPlaylist: (id) => {
      const i = playlists.findIndex((p) => p.id === id);
      if (i < 0) return { ok: false, erro: 'playlist nao encontrada' };
      const nome = playlists[i].nome;
      playlists.splice(i, 1);
      if (!gravarPlaylists()) return { ok: false, erro: 'nao consegui gravar o arquivo' };
      log('Playlist excluída: ' + nome);
      return { ok: true };
    },
    enviarComando: (c) => {
      if (c.tipo === 'ver-agora' || c.tipo === 'fila') {
        const ov = criarOverride(catalogos, c.slug, c.tipo === 'fila' ? 'fila' : 'zap',
          (Date.now() ^ 0x5bf03635) >>> 0, Date.now());
        if (!ov) return { ok: false, erro: 'serie sem episodio valido: ' + c.slug };
        estado.override = ov;
      } else if (c.tipo === 'playlist') {
        const p = playlists.find((x) => x.id === c.slug);
        if (!p) return { ok: false, erro: 'playlist nao encontrada: ' + c.slug };
        const ov = criarOverride(catalogos, p.series, 'fila', (Date.now() ^ 0x5bf03635) >>> 0, Date.now(), p.nome);
        if (!ov) return { ok: false, erro: 'playlist sem episodio valido: ' + p.nome };
        estado.override = ov;
      } else if (c.tipo === 'playlist-avulsa') {
        // varias series marcadas nos chips, sem salvar nada: playlist so pra esta sessao
        const validas = (c.series || []).filter((s) => catalogos[s]);
        if (!validas.length) return { ok: false, erro: 'nenhuma serie valida na selecao' };
        const nome = validas.length + ' séries';
        const ov = criarOverride(catalogos, validas, 'fila', (Date.now() ^ 0x5bf03635) >>> 0, Date.now(), nome);
        if (!ov) return { ok: false, erro: 'selecao sem episodio valido' };
        estado.override = ov;
      } else if (c.tipo === 'voltar-grade') {
        estado.override = null;
      } else if (c.tipo === 'pular') {
        if (estado.override) {
          // fila -> proximo sorteado; zap -> volta pra grade. Basta "envelhecer" o
          // iniciadoEm: o fila.js trata o episodio como terminado na proxima decisao.
          estado.override = { ...estado.override, iniciadoEm: Date.now() - estado.override.atual.duracaoMs - 1 };
        } else {
          // na grade -> antecipa o proximo item, do inicio (fica adiantado; decisao da spec)
          const prox = estado.proximos[0];
          if (!prox) return { ok: false, erro: 'nao ha proximo na grade' };
          // marca os DOIS: o que ele pulou (pra TV nao voltar pra ele) e o antecipado
          // (pra nao repetir quando o relogio chegar no horario dele).
          if (estado.entry && estado.origem === 'grade') estado.consumidos.add(chaveExibicao(estado.entry));
          estado.consumidos.add(chaveExibicao(prox));
          estado.override = { tipo: 'zap', slug: prox.slug, serie: prox.serie, seed: 0,
            atual: prox, restante: [], iniciadoEm: Date.now() };
        }
      }
      if (resolverComando) { resolverComando(); resolverComando = null; } // troca em <1s
      log('Comando do controle: ' + c.tipo + (c.slug ? ' ' + c.slug : ''));
      return { ok: true };
    },
    aoErro: (e) => log('⚠️ controle indisponível (' + e.code + ') — a TV segue normal'),
  });

  // Tela de perfil na primeira carga
  const t0Boot = Date.now();
  await page.goto('https://play.hbomax.com/', { waitUntil: 'domcontentloaded' });

  // Cobre a home do Max enquanto a TV arranca. A vinheta normal não pega aqui: ela só
  // monta quando existe payload no localStorage, e no boot ainda não existe — então o
  // Lucas ficava ~40s olhando a home do streaming (relatado 29/07).
  // pointer-events:none pra não bloquear o clique no perfil que vem logo abaixo.
  await page.evaluate(() => {
    if (document.getElementById('cartoontv-boot')) return;
    const el = document.createElement('div');
    el.id = 'cartoontv-boot';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;' +
      'background:#0C110E;display:flex;align-items:center;justify-content:center;' +
      "font:600 clamp(18px,4vw,42px)/1.4 Consolas,'Cascadia Mono',monospace;" +
      'color:#35E070;letter-spacing:.22em;text-align:center;';
    el.innerHTML = '<div>CARTOON TV<div style="font-size:.42em;color:#4F9A68;letter-spacing:.3em;' +
      'margin-top:1.1em">ligando<span id="ctv-pts"></span></div></div>';
    document.documentElement.appendChild(el);
    let n = 0;
    setInterval(() => { const p = document.getElementById('ctv-pts'); if (p) p.textContent = '.'.repeat(n++ % 4); }, 400);
    // se a página trocar o body por baixo, remonta
    new MutationObserver(() => {
      if (!document.getElementById('cartoontv-boot')) document.documentElement.appendChild(el);
    }).observe(document.documentElement, { childList: true });
  }).catch(() => {});

  await page.waitForTimeout(4000);
  await escolherPerfil(page, log);

  log('=== TV ligada — ' + new Date().toLocaleDateString('pt-BR') + ' === (Chrome: ' +
    ((t0Boot - t0Processo) / 1000).toFixed(1) + 's + home: ' + ((Date.now() - t0Boot) / 1000).toFixed(1) + 's)');
  let ligando = true;
  let ultimoVideoId = null;
  while (!desligada) {
    const prog = programaAtual();
    if (!prog) { log('Grade sem programa agora — tentando de novo em 30s'); await page.waitForTimeout(30000); continue; }
    const { entry, offsetSeg } = prog;
    estado.ligada = true; estado.entry = entry;
    estado.trocouEmMs = Date.now();
    estado.iniciadoEmMs = Date.now() - offsetSeg * 1000;
    estado.ultimoTempoVideo = offsetSeg; estado.ultimaLeituraMs = Date.now();
    const alvo = urlDe(entry);
    log('NO AR: ' + entry.slug + ' T' + entry.temporada + 'E' + entry.episodio + ' — ' + entry.nome +
      (offsetSeg > 10 ? ' (entrando aos ' + Math.floor(offsetSeg / 60) + 'min' + (offsetSeg % 60) + 's)' : ''));

    try {
      // Payload da vinheta (só quando é troca de programa de verdade, não correção)
      if (entry.videoId !== ultimoVideoId) {
        const { minutos } = agoraInfo();
        await page.evaluate((pl) => {
          try { localStorage.setItem('cartoontv_vinheta', JSON.stringify(pl)); } catch (e) {}
        }, {
          ts: Date.now(),
          tipo: ligando ? 'ligando' : (entry.intervalo ? 'intervalo' : 'a-seguir'),
          nome: entry.serie,
          sub: entry.nome + '  ·  T' + entry.temporada + ' EP ' + entry.episodio + '  ·  ' + entry.inicio,
          faixa: faixaDoMinuto(minutos),
          seed: (Date.now() ^ (entry.inicioMin * 1000)) >>> 0,
        }).catch(() => {});
      }
      ligando = false;
      ultimoVideoId = entry.videoId;
      const t0 = Date.now();
      await page.goto(alvo, { waitUntil: 'domcontentloaded' });

      // Espera o vídeo REALMENTE rodar (mede o tempo de troca) e aplica seek+som
      let rodouEm = null;
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(500);
        const volSalvo = lerVolume(ARQ_PREF);
        const ok = await page.evaluate(({ seg, vol }) => {
          // A página do Max tem mais de um <video> (trailer/preview além do player).
          // querySelector pegava o primeiro, que nem sempre é o que toca — daí o volume
          // parecer não obedecer. Aplica em TODOS e mede pelo que está realmente tocando.
          const todos = [...document.querySelectorAll('video')];
          if (!todos.length) return false;
          for (const el of todos) {
            el.muted = false;
            if (vol != null && Math.abs(el.volume - vol) > 0.005) el.volume = vol;
          }
          const v = todos.find((x) => !x.paused && x.currentTime > 0.5) || todos[0];
          if (v.paused) v.play().catch(() => {});
          if (v.currentTime > 0.5 && !v.paused && v.readyState >= 3) {
            if (seg > 15 && Math.abs(v.currentTime - seg) > 20) v.currentTime = seg;
            return true;
          }
          return false;
        }, { seg: offsetSeg, vol: volSalvo }).catch(() => false);
        if (ok) { rodouEm = ((Date.now() - t0) / 1000).toFixed(1); break; }
      }
      if (rodouEm) {
        log('Vídeo rodando em ' + rodouEm + 's (vinheta cobriu a troca)');
      } else {
        // Diagnóstico: o que tem na tela?
        const diag = await page.evaluate(() => {
          const v = document.querySelector('video');
          return {
            url: location.href,
            temVideo: !!v,
            pausado: v ? v.paused : null,
            readyState: v ? v.readyState : null,
            erroVideo: v && v.error ? v.error.code : null,
            botoes: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').replace(/[⁦-⁩]/g, '').trim()).filter(Boolean).slice(0, 8),
            texto: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 300),
          };
        }).catch((e) => ({ falhaDiag: e.message.slice(0, 100) }));
        log('⚠️ vídeo não confirmou play em 30s — DIAG: ' + JSON.stringify(diag));
        try { await page.screenshot({ path: path.join(__dirname, 'diag-' + Date.now() + '.png') }); } catch (e) {}
      }

      // Vigia até o fim do programa (pelo relógio da grade)
      const fimEmMs = (entry.duracaoMs - offsetSeg * 1000);
      const deadline = Date.now() + Math.max(5000, fimEmMs);
      let ultimoTempo = -1, paradas = 0;
      while (!desligada && Date.now() < deadline) {
        // Promise.race: ou passa o tick, ou chega um comando do controle. Sem isso o
        // clique ficaria preso até 5s dentro do waitForTimeout.
        const espera = page.waitForTimeout(Math.min(TICK_MS, Math.max(500, deadline - Date.now())));
        const veioComando = await Promise.race([
          espera.then(() => false),
          new Promise((r) => { resolverComando = () => r(true); }),
        ]);
        resolverComando = null;
        if (veioComando) break;
        // Autoplay do Max desviou pra outro vídeo? Corrige.
        if (!page.url().includes(entry.videoId)) {
          if (Date.now() >= deadline - TICK_MS) break; // fim natural, deixa trocar
          log('Autoplay desviou — voltando pro programa da grade');
          break;
        }
        // Player travado? (tempo não anda 3 checagens seguidas)
        // Janela curta só pra cobrir o CARREGAMENTO: enquanto o player monta, o Max pode
        // restaurar o volume dele por cima do nosso. Passados 6s a TV para de forçar e
        // passa a obedecer — se ficasse forçando, um ajuste do Lucas logo no começo do
        // episódio seria revertido pela propria TV.
        const protegido = Date.now() - estado.trocouEmMs < 6000;
        const salvo = lerVolume(ARQ_PREF);
        const t = await page.evaluate(({ vol, forcar }) => {
          const todos = [...document.querySelectorAll('video')];
          if (!todos.length) return null;
          if (forcar && vol != null) {
            for (const el of todos) if (Math.abs(el.volume - vol) > 0.005) el.volume = vol;
          }
          const v = todos.find((x) => !x.paused && x.currentTime > 0.5) || todos[0];
          return { tempo: v.currentTime, pausado: v.paused, vol: v.volume, quantos: todos.length };
        }, { vol: salvo, forcar: protegido }).catch(() => null);
        if (t) {
          // alimenta o /estado sem que o servidor precise falar com o Playwright
          estado.ultimoTempoVideo = t.tempo; estado.ultimaLeituraMs = Date.now();
          estado.volume = t.vol; estado.videosNaPagina = t.quantos;
          // fora da janela de proteção, aprende o volume que o Lucas deixou no Max
          if (!protegido && typeof t.vol === 'number' && Math.abs(t.vol - (salvo ?? -1)) > 0.005) {
            gravarVolume(ARQ_PREF, t.vol);
            log('Volume aprendido: ' + Math.round(t.vol * 100) + '% (era ' + Math.round((salvo ?? 0) * 100) + '%)');
          }
        }
        if (t && !t.pausado) {
          if (Math.abs(t.tempo - ultimoTempo) < 0.3) { paradas++; } else { paradas = 0; }
          ultimoTempo = t.tempo;
          if (paradas >= 4) { log('Player travado — recarregando'); break; }
        }
        // Prompt "ainda está assistindo?" — clica em continuar se aparecer
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')]
            .find((x) => /continuar|ainda est|keep watching|resume/i.test(x.textContent || ''));
          if (b) b.click();
        }).catch(() => {});
      }
    } catch (e) {
      // Fechar a janela na mão mata a operação em voo ANTES do evento 'close' chegar,
      // então a exceção vinha antes de `desligada` virar true e todo desligamento
      // normal aparecia no log como "Erro no player" (28/07: 3 sessões assim).
      // ⚠️ Um crash do Chrome cai no mesmo balde — o Playwright não distingue os dois.
      if (desligada || page.isClosed() || /has been closed|Target closed|browser has disconnected/i.test(e.message)) {
        desligada = true; fimLimpo = true; break;
      }
      log('🔴 Erro no player: ' + e.message.slice(0, 100) + ' — tentando de novo em 10s');
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
  estado.ligada = false;
  log(fimLimpo ? 'TV desligada (janela fechada).' : 'TV desligada (saiu do loop sem fechamento — investigar).');
  await ctx.close().catch(() => {});
  // O servidor de controle segura o event loop: sem fechar, o processo node fica VIVO
  // depois de a TV desligar, ocupando a porta 4599. O atalho seguinte subia uma instância
  // que não conseguia a porta, e o controle via o zumbi respondendo `ligada:false` e ficava
  // esperando pra sempre. (medido 29/07, PID 30872 sobrevivendo 8min ao fim da TV)
  try { servidorControle.close(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error('ERRO FATAL: ' + e.message); process.exit(1); });
