// Vinhetas da Cartoon TV — CSS puro, zero imagem, zero request externo.
// Sistema dinâmico: variante sorteada por seed a cada troca + paleta por faixa
// do dia. Na faixa Adult Swim a vinheta vira o cartão preto-e-branco [as].
// Exporta o código do INIT SCRIPT (roda em toda navegação do Chrome da TV):
// ele lê o payload do localStorage, monta o overlay IMEDIATAMENTE (antes do
// player aparecer) e se remove com fade quando o vídeo está rodando.

const INIT_SCRIPT = `(() => {
  if (window.top !== window) return; // só no frame principal
  let payload = null;
  try { payload = JSON.parse(localStorage.getItem('cartoontv_vinheta') || 'null'); } catch (e) {}
  if (!payload || Date.now() - payload.ts > 30000) return; // payload velho = não é troca nossa
  try { localStorage.removeItem('cartoontv_vinheta'); } catch (e) {}

  const PALETAS = {
    manha:     { fundo: '#F7C948', tinta: '#1F1300', pop: '#E8590C' },
    tarde:     { fundo: '#2B8DE0', tinta: '#FFFFFF', pop: '#FFD43B' },
    noite:     { fundo: '#5F3DC4', tinta: '#FFFFFF', pop: '#94D82D' },
    adultswim: { fundo: '#000000', tinta: '#FFFFFF', pop: '#FFFFFF' },
    madrugada: { fundo: '#111318', tinta: '#E9ECEF', pop: '#4DABF7' },
  };
  const p = PALETAS[payload.faixa] || PALETAS.tarde;
  const rnd = (function (a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(payload.seed || 1);

  const rotulo = payload.tipo === 'intervalo' ? 'JÁ VOLTAMOS'
    : payload.tipo === 'ligando' ? 'VOCÊ ESTÁ ASSISTINDO' : 'A SEGUIR';
  const nome = (payload.nome || '').toUpperCase();
  const sub = payload.sub || '';

  // ---- variantes de fundo animado (CSS puro) ----
  const variantes = [
    // 0: xadrez CN clássico varrendo a tela
    \`<div class="ctv-xadrez"></div>\`,
    // 1: círculos concêntricos pulsando
    \`<div class="ctv-circulos"><i></i><i></i><i></i><i></i></div>\`,
    // 2: barras verticais deslizando (cartela retrô)
    \`<div class="ctv-barras"><i></i><i></i><i></i><i></i><i></i><i></i></div>\`,
    // 3: losangos flutuando
    \`<div class="ctv-losangos"><i></i><i></i><i></i><i></i><i></i></div>\`,
  ];
  // Adult Swim: sempre o cartão minimalista (sem fundo animado)
  const ehAS = payload.faixa === 'adultswim';
  const fundoHtml = ehAS ? '' : variantes[Math.floor(rnd() * variantes.length)];

  const css = \`
  #cartoontv-vinheta{position:fixed;inset:0;z-index:2147483647;overflow:hidden;
    background:\${p.fundo};display:flex;align-items:center;justify-content:center;
    font-family:'Arial Black','Segoe UI',system-ui,sans-serif;opacity:1;
    transition:opacity .6s ease}
  #cartoontv-vinheta.ctv-sair{opacity:0}
  .ctv-conteudo{position:relative;z-index:5;text-align:\${ehAS ? 'left' : 'center'};
    color:\${p.tinta};padding:4vw;max-width:80vw}
  .ctv-rotulo{font-size:\${ehAS ? '1.8vw' : '1.6vw'};letter-spacing:\${ehAS ? '.2em' : '.45em'};font-weight:\${ehAS ? '400' : '700'};
    opacity:.85;animation:ctvSobe .7s ease both;
    \${ehAS ? 'font-family:Georgia,serif;text-transform:lowercase' : ''}}
  .ctv-nome{font-size:\${ehAS ? '3.4vw' : '4.6vw'};line-height:1.05;font-weight:900;
    margin-top:1.2vw;animation:ctvSobe .7s .15s ease both;
    \${ehAS ? 'font-family:Georgia,serif;font-weight:400;text-transform:lowercase;border:2px solid #fff;padding:1vw 2vw;display:inline-block' : ''}}
  .ctv-sub{font-size:1.4vw;margin-top:1.2vw;opacity:.75;letter-spacing:.12em;
    animation:ctvSobe .7s .3s ease both;\${ehAS ? 'font-family:Georgia,serif' : ''}}
  @keyframes ctvSobe{from{transform:translateY(2.2vw);opacity:0}to{transform:none;opacity:1}}
  .ctv-xadrez{position:absolute;inset:-10%;
    background:repeating-conic-gradient(\${p.tinta}18 0% 25%,transparent 0% 50%);
    background-size:9vw 9vw;animation:ctvVarre 14s linear infinite}
  @keyframes ctvVarre{to{background-position:18vw 9vw}}
  .ctv-circulos i{position:absolute;top:50%;left:50%;border-radius:50%;
    border:.5vw solid \${p.pop}33;transform:translate(-50%,-50%);
    animation:ctvPulsa 3.2s ease-out infinite}
  .ctv-circulos i:nth-child(1){width:30vw;height:30vw}
  .ctv-circulos i:nth-child(2){width:52vw;height:52vw;animation-delay:.4s}
  .ctv-circulos i:nth-child(3){width:74vw;height:74vw;animation-delay:.8s}
  .ctv-circulos i:nth-child(4){width:96vw;height:96vw;animation-delay:1.2s}
  @keyframes ctvPulsa{0%{opacity:0;scale:.92}35%{opacity:1}100%{opacity:0;scale:1.06}}
  .ctv-barras{position:absolute;inset:0;display:flex}
  .ctv-barras i{flex:1;background:\${p.pop}22;transform:translateY(101%);
    animation:ctvBarra 1.1s cubic-bezier(.7,0,.2,1) both}
  .ctv-barras i:nth-child(odd){background:\${p.tinta}14}
  .ctv-barras i:nth-child(2){animation-delay:.07s}.ctv-barras i:nth-child(3){animation-delay:.14s}
  .ctv-barras i:nth-child(4){animation-delay:.21s}.ctv-barras i:nth-child(5){animation-delay:.28s}
  .ctv-barras i:nth-child(6){animation-delay:.35s}
  @keyframes ctvBarra{to{transform:none}}
  .ctv-losangos i{position:absolute;width:7vw;height:7vw;background:\${p.pop}2e;rotate:45deg;
    animation:ctvFlutua 6s ease-in-out infinite alternate}
  .ctv-losangos i:nth-child(1){top:12%;left:9%}
  .ctv-losangos i:nth-child(2){top:64%;left:16%;animation-delay:.8s;scale:1.5}
  .ctv-losangos i:nth-child(3){top:24%;left:78%;animation-delay:1.6s;scale:2}
  .ctv-losangos i:nth-child(4){top:72%;left:84%;animation-delay:2.4s}
  .ctv-losangos i:nth-child(5){top:44%;left:48%;animation-delay:3.2s;scale:.8}
  @keyframes ctvFlutua{to{transform:translateY(-3.5vw) rotate(18deg)}}
  \`;

  const montar = () => {
    if (!document.documentElement || document.getElementById('cartoontv-vinheta')) return;
    const el = document.createElement('div');
    el.id = 'cartoontv-vinheta';
    el.innerHTML = '<style>' + css + '</style>' + fundoHtml +
      '<div class="ctv-conteudo"><div class="ctv-rotulo">' + rotulo + '</div>' +
      '<div class="ctv-nome">' + (ehAS ? nome.toLowerCase() : nome) + '</div>' +
      (sub ? '<div class="ctv-sub">' + sub + '</div>' : '') + '</div>';
    document.documentElement.appendChild(el);
  };
  montar();
  new MutationObserver(() => montar()).observe(document.documentElement, { childList: true });

  const nasceu = Date.now();
  const MIN_MS = 2400, MAX_MS = 25000;
  const timer = setInterval(() => {
    const v = document.querySelector('video');
    const pronto = v && v.currentTime > 0.5 && !v.paused && v.readyState >= 3;
    const passou = Date.now() - nasceu;
    if ((pronto && passou >= MIN_MS) || passou >= MAX_MS) {
      clearInterval(timer);
      const el = document.getElementById('cartoontv-vinheta');
      if (el) { el.classList.add('ctv-sair'); setTimeout(() => el.remove(), 700); }
    }
  }, 250);
})();`;

// Faixa do dia a partir do minuto de programação (bate com canal-cartoon.json)
function faixaDoMinuto(minutos) {
  const m = minutos % (24 * 60);
  if (m >= 6 * 60 && m < 12 * 60) return 'manha';
  if (m >= 12 * 60 && m < 18 * 60) return 'tarde';
  if (m >= 18 * 60 && m < 22 * 60) return 'noite';
  if (m >= 22 * 60 || m < 2 * 60) return 'adultswim';
  return 'madrugada';
}

module.exports = { INIT_SCRIPT, faixaDoMinuto };
