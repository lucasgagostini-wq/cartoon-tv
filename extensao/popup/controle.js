// O controle remoto. Diferença pro app: não existe servidor HTTP — o que está no ar vem do
// chrome.storage (escrito pelo content script) e os comandos vão por mensagem pra aba do Max.
const $ = (id) => document.getElementById(id);
const MAX = 'https://play.hbomax.com/';

let catalogo = {}, playlists = [], marcados = new Set(), abaTv = null;

const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + 'min' + String(s % 60).padStart(2, '0') + 's'; };
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function avisar(msg) {
  $('erro').textContent = msg || '';
  if (msg) setTimeout(() => { if ($('erro').textContent === msg) $('erro').textContent = ''; }, 4000);
}

// ---------- aba do streaming ----------
async function acharAba() {
  const abas = await chrome.tabs.query({ url: 'https://play.hbomax.com/*' });
  abaTv = abas[0] || null;
  return abaTv;
}

async function mandar(msg) {
  if (!abaTv) await acharAba();
  if (!abaTv) return { ok: false, erro: 'a aba do HBO Max não está aberta' };
  try { return await chrome.tabs.sendMessage(abaTv.id, msg); }
  catch (e) { return { ok: false, erro: 'a aba não respondeu — recarregue o HBO Max' }; }
}

async function comando(tipo, extra = {}) {
  const r = await mandar({ tipo, ...extra });
  if (!r || !r.ok) return avisar(r?.erro || 'falhou');
  marcados.clear(); pintarChips(); ligarAcoes();
  setTimeout(pintar, 400);
}

// ---------- telas ----------
function mostrarAviso(html) {
  $('aviso').classList.remove('oculto');
  $('painel').classList.add('oculto');
  $('aviso').innerHTML = html;
}

async function pintar() {
  const aba = await acharAba();
  if (!aba) {
    return mostrarAviso('<b>HBO Max não está aberto</b>A TV toca dentro da aba do streaming.' +
      '<div class="acao"><div class="bt destaque" id="bt-abrir">abrir o HBO Max</div></div>');
  }

  const { tv, noAr } = await chrome.storage.local.get(['tv', 'noAr']);
  if (!tv?.ligada) {
    return mostrarAviso('<b>TV desligada</b>Ligue e ela começa no programa do horário.' +
      '<div class="acao"><div class="bt destaque" id="bt-ligar">&#9654; ligar a TV</div></div>');
  }
  if (!noAr?.ligada) {
    return mostrarAviso('<b>Ligando…</b>Procurando o programa do horário.');
  }

  $('aviso').classList.add('oculto');
  $('painel').classList.remove('oculto');

  // o content script grava a cada tick; interpola pra barra andar suave entre eles
  const decorrido = noAr.decorridoSeg + (Date.now() - noAr.atualizadoEm) / 1000;
  const pct = noAr.duracaoSeg ? Math.max(0, Math.min(1, decorrido / noAr.duracaoSeg)) : 0;
  const cheio = Math.round(pct * 28);
  const emFila = noAr.origem === 'fila';

  $('relogio').textContent = new Date().toTimeString().slice(0, 8);
  $('serie').textContent = noAr.serie;
  $('epi').textContent = noAr.nome;
  $('meta').textContent = 'T' + noAr.temporada + ' E' + noAr.episodio + '  ·  ' +
    (noAr.origem === 'grade' ? 'começou ' + noAr.inicio : 'fora da grade');
  $('cheio').textContent = '█'.repeat(cheio);
  $('vazio').textContent = '░'.repeat(28 - cheio);
  $('resta').textContent = mmss(noAr.duracaoSeg - decorrido);
  $('pct').textContent = Math.round(pct * 100) + '%';

  const badge = $('badge');
  badge.classList.toggle('oculto', noAr.origem === 'grade');
  if (noAr.origem !== 'grade') badge.textContent = emFila ? 'FILA · ' + (noAr.fila?.serie || '') : 'ZAP';
  $('bt-voltar').classList.toggle('off', noAr.origem === 'grade');
}

function pintarChips() {
  const f = norm($('filtro').value);
  const lista = Object.values(catalogo)
    .map((c) => ({ slug: c.slug, nome: c.nome }))
    .filter((s) => !f || norm(s.nome).includes(f) || s.slug.includes(f))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('chips').innerHTML = lista.map((s) =>
    '<span class="chip' + (marcados.has(s.slug) ? ' sel' : '') + '" data-slug="' + esc(s.slug) + '">' +
    (marcados.has(s.slug) ? '✓ ' : '') + esc(s.nome) + '</span>').join('');
  for (const c of $('chips').children) {
    c.onclick = () => {
      if (marcados.has(c.dataset.slug)) marcados.delete(c.dataset.slug); else marcados.add(c.dataset.slug);
      pintarChips(); ligarAcoes();
    };
  }
}

function ligarAcoes() {
  const n = marcados.size;
  $('contador').textContent = n ? n + ' marcada' + (n > 1 ? 's' : '') : '';
  $('bt-ver').classList.toggle('off', n !== 1);
  $('bt-fila').classList.toggle('off', n < 1);
}

function pintarPlaylists() {
  $('playlists').innerHTML = playlists.map((p, i) =>
    '<div class="item pl" data-i="' + i + '" title="' + esc(p.series.join(' · ')) + '">' +
    '<span class="h">&#8734;</span><span class="n">' + esc(p.nome) + '</span>' +
    '<span class="te">' + p.series.length + '&nbsp;séries</span></div>').join('');
  for (const el of $('playlists').children) {
    el.onclick = () => {
      const p = playlists[Number(el.dataset.i)];
      comando('playlist', { series: p.series, nome: p.nome });
    };
  }
}

// ---------- eventos ----------
document.addEventListener('click', async (ev) => {
  const alvo = ev.target.closest('.bt, #bt-abrir, #bt-ligar');
  if (!alvo || alvo.classList.contains('off')) return;
  if (alvo.id === 'bt-abrir') { await chrome.tabs.create({ url: MAX }); return window.close(); }
  if (alvo.id === 'bt-ligar') { await comando('ligar'); return; }
  if (alvo.id === 'bt-desligar') { await comando('desligar'); return; }
  if (alvo.dataset.cmd === 'ver-agora' || alvo.dataset.cmd === 'fila') {
    if (marcados.size > 1 && alvo.dataset.cmd === 'fila') {
      return comando('playlist', { series: [...marcados], nome: marcados.size + ' séries' });
    }
    return comando(alvo.dataset.cmd, { slug: [...marcados][0] });
  }
  if (alvo.dataset.cmd) return comando(alvo.dataset.cmd);
});

$('filtro').oninput = pintarChips;

(async () => {
  const url = (p) => chrome.runtime.getURL(p);
  try {
    catalogo = await (await fetch(url('dados/catalogo.json'))).json();
    playlists = (await (await fetch(url('dados/playlists.json'))).json()).playlists || [];
  } catch (e) { avisar('não consegui ler o catálogo'); }
  pintarChips(); pintarPlaylists(); ligarAcoes();
  await pintar();
  setInterval(pintar, 1000);
})();
