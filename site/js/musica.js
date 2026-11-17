// Música das campanhas — toca na área de cada campanha e troca conforme o cliente rola a página.
// Os navegadores só liberam som depois do primeiro toque/clique do cliente na página.
// Natal: "Jingle Bells" (melodia de James Lord Pierpont, 1857, domínio público),
//        interpretação própria sintetizada no navegador (sem gravação de terceiros).
// Réveillon: composição original desta loja, também sintetizada.
// Se o painel definir um arquivo de áudio próprio, ele é usado no lugar.

const N = { G2: 98, A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66 };

// [nota, duração em tempos]
const JINGLE = {
  bpm: 132, compasso: 4,
  melodia: [
    ['B4', 1], ['B4', 1], ['B4', 2], ['B4', 1], ['B4', 1], ['B4', 2], ['B4', 1], ['D5', 1], ['G4', 1.5], ['A4', .5], ['B4', 4],
    ['C5', 1], ['C5', 1], ['C5', 1.5], ['C5', .5], ['C5', 1], ['B4', 1], ['B4', 1], ['B4', .5], ['B4', .5], ['B4', 1], ['A4', 1], ['A4', 1], ['B4', 1], ['A4', 2], ['D5', 2],
    ['B4', 1], ['B4', 1], ['B4', 2], ['B4', 1], ['B4', 1], ['B4', 2], ['B4', 1], ['D5', 1], ['G4', 1.5], ['A4', .5], ['B4', 4],
    ['C5', 1], ['C5', 1], ['C5', 1.5], ['C5', .5], ['C5', 1], ['B4', 1], ['B4', 1], ['B4', .5], ['B4', .5], ['D5', 1], ['D5', 1], ['C5', 1], ['A4', 1], ['G4', 4],
  ],
  acordes: ['G', 'G', 'G', 'G', 'C', 'G', 'D', 'D', 'G', 'G', 'G', 'G', 'C', 'G', 'D', 'G'],
  baixo: { G: ['G2', 'D3'], C: ['C3', 'G3'], D: ['D3', 'A2'] },
  pad: { G: ['G3', 'B3', 'D4'], C: ['C4', 'E4', 'G4'], D: ['D4', 'F4', 'A4'] },
  guizos: true,
};

// Composição original (3/4), elegante e festiva
const VIRADA = {
  bpm: 92, compasso: 3,
  melodia: [
    ['E5', 1], ['G5', 1], ['C6', 1], ['B5', 1.5], ['A5', .5], ['E5', 1], ['F5', 1], ['A5', 1], ['D6', 1], ['C6', 2], ['G5', 1],
    ['E5', 1], ['G5', 1], ['B5', 1], ['A5', 1.5], ['F5', .5], ['C6', 1], ['B5', 1], ['A5', 1], ['D5', 1], ['C5', 3],
    ['G5', 1], ['E5', 1], ['G5', 1], ['A5', 1.5], ['G5', .5], ['F5', 1], ['D5', 1], ['F5', 1], ['A5', 1], ['G5', 3],
    ['C6', 1], ['B5', 1], ['A5', 1], ['G5', 1], ['E5', 1], ['C5', 1], ['D5', 1.5], ['E5', .5], ['B4', 1], ['C5', 3],
  ],
  acordes: ['C', 'Am', 'Dm', 'G', 'C', 'F', 'Dm', 'C', 'C', 'F', 'Dm', 'G', 'F', 'Am', 'G', 'C'],
  baixo: { C: ['C3'], Am: ['A2'], Dm: ['D3'], G: ['G2'], F: ['F3'] },
  pad: { C: ['E4', 'G4', 'B4'], Am: ['C4', 'E4', 'G4'], Dm: ['D4', 'F4', 'A4'], G: ['D4', 'F4', 'B4'], F: ['F4', 'A4', 'C5'] },
  brilhos: true,
};

// Um único "motor" de áudio para a página inteira (exigência do iPhone para tocar depois do 1º toque)
const motor = { ctx: null, saida: null };
function prepararMotor() {
  if (!motor.ctx) {
    motor.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = motor.ctx.createDynamicsCompressor();
    motor.saida = motor.ctx.createGain();
    motor.saida.gain.value = 1;
    motor.saida.connect(comp).connect(motor.ctx.destination);
  }
  if (motor.ctx.state !== 'running') motor.ctx.resume();
  return motor;
}

class Sintetizador {
  constructor(peca) { this.peca = peca; this.tocando = false; this.volume = 0.4; }
  iniciar() {
    const { ctx, saida } = prepararMotor();
    this.ctx = ctx;
    if (!this.mestre) {
      this.mestre = ctx.createGain(); this.mestre.gain.value = 0; this.mestre.connect(saida);
      this.eco = ctx.createDelay(); this.eco.delayTime.value = 0.28;
      const re = ctx.createGain(); re.gain.value = 0.22;
      this.eco.connect(re).connect(this.eco); re.connect(this.mestre);
      this.ruido = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = this.ruido.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    this.mestre.gain.cancelScheduledValues(ctx.currentTime);
    this.mestre.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.6); // entra suave
    if (this.tocando) return Promise.resolve();
    this.tocando = true;
    this.proximo = ctx.currentTime + 0.1;
    this.i = 0; this.tempo = 0;
    clearInterval(this.timer);
    this.agendar();
    this.timer = setInterval(() => this.agendar(), 120);
    return Promise.resolve();
  }
  parar() {
    if (!this.ctx || !this.tocando) return;
    this.tocando = false;
    this.mestre.gain.cancelScheduledValues(this.ctx.currentTime);
    this.mestre.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); // sai suave
    const t = this.timer;
    setTimeout(() => { if (!this.tocando) clearInterval(t); }, 1500);
  }
  definirVolume(v) { this.volume = v; if (this.ctx && this.tocando) this.mestre.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  agendar() {
    if (!this.tocando) return;
    const p = this.peca, seg = 60 / p.bpm;
    while (this.proximo < this.ctx.currentTime + 0.5) {
      const [nota, dur] = p.melodia[this.i];
      if (this.tempo % p.compasso === 0) this.acompanhar(p.acordes[Math.floor(this.tempo / p.compasso) % p.acordes.length], this.proximo, seg);
      this.sino(N[nota], this.proximo, dur * seg);
      this.proximo += dur * seg;
      this.tempo += dur;
      this.i++;
      if (this.i >= p.melodia.length) { this.i = 0; this.tempo = 0; this.proximo += seg * p.compasso; } // repete sem parar
    }
  }
  sino(f, t, dur) {
    const c = this.ctx, g = c.createGain(), o1 = c.createOscillator(), o2 = c.createOscillator(), g2 = c.createGain();
    o1.type = 'sine'; o1.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * (this.peca.brilhos ? 4 : 2.76);
    g2.gain.value = this.peca.brilhos ? 0.12 : 0.22;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.5, dur * 1.6));
    o1.connect(g); o2.connect(g2).connect(g); g.connect(this.mestre); g.connect(this.eco);
    o1.start(t); o2.start(t); o1.stop(t + dur * 1.7 + 0.6); o2.stop(t + dur * 1.7 + 0.6);
  }
  acompanhar(acorde, t, seg) {
    const p = this.peca, c = this.ctx, compasso = seg * p.compasso;
    (p.baixo[acorde] || []).forEach((n, k) => {
      const inicio = t + k * (compasso / p.baixo[acorde].length);
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = N[n];
      g.gain.setValueAtTime(0.0001, inicio); g.gain.exponentialRampToValueAtTime(0.28, inicio + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, inicio + seg * 1.6);
      o.connect(g).connect(this.mestre); o.start(inicio); o.stop(inicio + seg * 1.8);
    });
    (p.pad[acorde] || []).forEach((n) => {
      const o = c.createOscillator(), g = c.createGain(), fil = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = N[n]; fil.type = 'lowpass'; fil.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.025, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + compasso);
      o.connect(fil).connect(g).connect(this.mestre); o.start(t); o.stop(t + compasso + 0.05);
    });
    if (p.guizos) for (let k = 0; k < p.compasso * 2; k++) this.guizo(t + k * seg / 2, k % 2 ? 0.05 : 0.09);
    if (p.brilhos) for (let k = 0; k < 3; k++) {
      const n = (p.pad[acorde] || [])[k]; if (!n) continue;
      const tt = t + seg * (k * 0.33 + 0.5);
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = N[n] * 4;
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.05, tt + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.6);
      o.connect(g).connect(this.eco); o.start(tt); o.stop(tt + 0.7);
    }
  }
  guizo(t, vol) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.ruido; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(f).connect(g).connect(this.mestre); s.start(t); s.stop(t + 0.15);
  }
}

class Arquivo {
  constructor(url) { this.el = new Audio(url); this.el.loop = true; this.el.preload = 'none'; this.volume = 0.4; this.alvo = 0; }
  desbloquear() { const v = this.el.volume; this.el.volume = 0; this.el.play().then(() => { if (!this.tocando) this.el.pause(); this.el.volume = v; }).catch(() => {}); }
  iniciar() { this.tocando = true; this.fade(this.volume); return this.el.play(); }
  parar() { this.tocando = false; this.fade(0, () => this.el.pause()); }
  fade(alvo, fim) {
    clearInterval(this.t);
    this.t = setInterval(() => {
      const v = this.el.volume + Math.sign(alvo - this.el.volume) * 0.04;
      if (Math.abs(alvo - this.el.volume) <= 0.04) { this.el.volume = alvo; clearInterval(this.t); fim?.(); } else this.el.volume = Math.min(1, Math.max(0, v));
    }, 50);
  }
  definirVolume(v) { this.volume = v; if (this.tocando) this.el.volume = v; }
}

export function criarPlayer(campanha, base) {
  const m = campanha.musica || {};
  if (m.fonte === 'arquivo' && m.arquivo) return new Arquivo(`${base}audio-loja/${m.arquivo}`);
  return new Sintetizador(campanha.tema === 'reveillon' ? VIRADA : JINGLE);
}

/**
 * Toca a música de cada campanha enquanto o cliente está na área dela
 * (banner do topo ou bloco de produtos) e troca suavemente ao rolar a página.
 */
export function iniciarMusicaPorArea(el, campanhas, base) {
  if (!el || el.dataset.pronto) return;
  el.dataset.pronto = '1';
  const porId = new Map(campanhas.map((c) => [c.id, c]));
  const players = new Map();
  const player = (id) => { if (!players.has(id)) { const p = criarPlayer(porId.get(id), base); p.definirVolume(volume); players.set(id, p); } return players.get(id); };
  let volume = Number(localStorage.getItem('lvip-volume'));
  if (!Number.isFinite(volume) || volume <= 0 || volume > 1) volume = campanhas[0].musica?.volume ?? 0.4;
  let mudo = localStorage.getItem('lvip-musica-mudo') === '1';
  let liberado = false, atual = null, area = null;

  el.innerHTML = `<button type="button" class="musica-botao" aria-pressed="false"><span class="notas" aria-hidden="true"><i></i><i></i><i></i></span><span data-rotulo></span></button>
  <label class="musica-volume"><svg class="i" aria-hidden="true"><use href="#i-som"></use></svg><span class="sr">Volume</span><input type="range" min="0" max="1" step="0.05" value="${volume}"></label>`;
  const botao = el.querySelector('button'), rotulo = el.querySelector('[data-rotulo]'), faixa = el.querySelector('input');

  function areaNaTela() {
    const meio = innerHeight * 0.45;
    for (const s of document.querySelectorAll('[data-campanha]')) {
      const r = s.getBoundingClientRect();
      if (r.top <= meio && r.bottom >= meio && porId.has(s.dataset.campanha)) return s.dataset.campanha;
    }
    return null;
  }
  function desenhar() {
    el.hidden = !area;
    if (!area) return;
    const nome = porId.get(area).nome;
    const tocando = !!atual;
    el.classList.toggle('tocando', tocando);
    el.classList.toggle('dica', !liberado && !mudo);
    botao.setAttribute('aria-pressed', String(tocando));
    botao.setAttribute('aria-label', tocando ? `Silenciar música de ${nome}` : `Ligar música de ${nome}`);
    rotulo.textContent = mudo ? 'Música desligada · ligar' : tocando ? `Música de ${nome} ♪` : `Toque para ouvir a música de ${nome}`;
  }
  function atualizar() {
    area = areaNaTela();
    const alvo = mudo || !liberado || document.hidden ? null : area;
    if (alvo !== atual) {
      if (atual) player(atual).parar();
      if (alvo) player(alvo).iniciar()?.catch?.(() => {});
      atual = alvo;
    }
    desenhar();
  }
  function liberar() {
    if (liberado) return;
    liberado = true;
    try { prepararMotor(); } catch { /* sem Web Audio */ }
    for (const c of campanhas) { const p = player(c.id); if (p instanceof Arquivo) p.desbloquear(); }
    ['pointerdown', 'keydown', 'touchend'].forEach((t) => removeEventListener(t, liberar, true));
    atualizar();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach((t) => addEventListener(t, liberar, { capture: true, passive: true }));

  botao.addEventListener('click', () => {
    if (!liberado) { liberar(); if (!mudo) return; }
    mudo = !!atual;
    localStorage.setItem('lvip-musica-mudo', mudo ? '1' : '0');
    atualizar();
  });
  faixa.addEventListener('input', () => { volume = Number(faixa.value); players.forEach((p) => p.definirVolume(volume)); localStorage.setItem('lvip-volume', faixa.value); });
  let pendente = false;
  addEventListener('scroll', () => { if (pendente) return; pendente = true; requestAnimationFrame(() => { pendente = false; atualizar(); }); }, { passive: true });
  addEventListener('resize', atualizar, { passive: true });
  document.addEventListener('visibilitychange', atualizar);
  atualizar();
  el.estadoMusica = () => ({ liberado, mudo, atual, area });
  return el.estadoMusica;
}
