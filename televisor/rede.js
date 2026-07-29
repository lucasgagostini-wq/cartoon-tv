// Endereço da TV na rede local e a chave que protege o acesso.
//
// Abrir o controle pra fora do 127.0.0.1 significa que qualquer aparelho no Wi-Fi alcança
// a TV — inclusive visita. Por isso todo acesso que não venha da própria máquina exige uma
// chave, gerada uma vez e guardada em configuracao.json.
const os = require('os');
const crypto = require('crypto');
const { ler, gravar } = require('./configuracao');

// IPv4 da placa que está de fato na rede (ignora loopback, Docker, WSL, VPN e afins)
function ipLocal() {
  const candidatos = [];
  for (const [nome, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/vEthernet|WSL|Loopback|VirtualBox|VMware|Docker|Hyper-V/i.test(nome)) continue;
      // 192.168.x / 10.x / 172.16-31.x — o resto quase nunca é a LAN de casa
      const priv = /^192\.168\./.test(a.address) || /^10\./.test(a.address) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(a.address);
      candidatos.push({ nome, ip: a.address, priv });
    }
  }
  candidatos.sort((a, b) => (b.priv - a.priv));
  return candidatos.length ? candidatos[0].ip : null;
}

function chave() {
  const cfg = ler();
  if (cfg.chaveControle && /^[a-z0-9]{10,}$/.test(cfg.chaveControle)) return cfg.chaveControle;
  const nova = crypto.randomBytes(8).toString('hex');
  gravar({ ...cfg, chaveControle: nova });
  return nova;
}

// O link que o Lucas manda pro próprio celular.
function linkCelular(porta) {
  const ip = ipLocal();
  return ip ? 'http://' + ip + ':' + porta + '/?k=' + chave() : null;
}

module.exports = { ipLocal, chave, linkCelular };
