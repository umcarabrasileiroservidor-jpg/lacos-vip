// Música das campanhas — nunca toca sozinha: o cliente aperta o botão.
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

class Sintetizador {
  constructor(peca) { this.peca = peca; this.ctx = null; this.tocando = false; this.volume = 0.4; }
  iniciar() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.mestre = this.ctx.createGain();
      this.comp = this.ctx.createDynamicsCompressor();
      this.mestre.connect(this.comp).connect(this.ctx.destination);
      this.eco = this.ctx.createDelay(); this.eco.delayTime.value = 0.28;
      const re = this.ctx.createGain(); re.gain.value = 0.22;
      this.eco.connect(re).connect(this.eco); re.connect(this.mestre);
      this.ruido = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
      const d = this.ruido.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    this.ctx.resume();
    this.mestre.gain.cancelScheduledValues(this.ctx.currentTime);
    this.mestre.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.2);
    this.tocando = true;
    this.proximo = this.ctx.currentTime + 0.1;
    this.i = 0; this.tempo = 0;
    this.agendar();
    this.timer = setInterval(() => this.agendar(), 120);
  }
  parar() {
    this.tocando = false;
    clearInterval(this.timer);
    if (this.ctx) { this.mestre.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15); setTimeout(() => !this.tocando && this.ctx.suspend(), 900); }
  }
  definirVolume(v) { this.volume = v; if (this.ctx && this.tocando) this.mestre.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  agendar() {
    const p = this.peca, seg = 60 / p.bpm;
    while (this.proximo < this.ctx.currentTime + 0.5) {
      const [nota, dur] = p.melodia[this.i];
      // acompanhamento no início de cada compasso
      if (this.tempo % p.compasso === 0) {
        const c = p.acordes[Math.floor(this.tempo / p.compasso) % p.acordes.length];
        this.acompanhar(c, this.proximo, seg);
      }
      this.sino(N[nota], this.proximo, dur * seg);
      this.proximo += dur * seg;
      this.tempo += dur;
      this.i++;
      if (this.i >= p.melodia.length) { this.i = 0; this.tempo = 0; this.proximo += seg * p.compasso; }
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
      const inicio = t + k * (compasso / (p.baixo[acorde].length));
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
  constructor(url) { this.el = new Audio(url); this.el.loop = true; this.el.preload = 'none'; this.volume = 0.4; }
  iniciar() { this.el.volume = this.volume; return this.el.play(); }
  parar() { this.el.pause(); }
  definirVolume(v) { this.volume = v; this.el.volume = v; }
}

export function criarPlayer(campanha, base) {
  const m = campanha.musica || {};
  if (m.fonte === 'arquivo' && m.arquivo) return new Arquivo(`${base}audio-loja/${m.arquivo}`);
  return new Sintetizador(campanha.tema === 'reveillon' ? VIRADA : JINGLE);
}

export function montarControle(el, campanha, base) {
  if (!el || el.dataset.pronto) return;
  el.dataset.pronto = '1';
  const player = criarPlayer(campanha, base);
  let vol = Number(localStorage.getItem('lvip-volume'));
  if (!Number.isFinite(vol) || vol <= 0 || vol > 1) vol = campanha.musica?.volume ?? 0.4;
  player.definirVolume(vol);
  const rotulo = campanha.tema === 'reveillon' ? 'Música de Réveillon' : 'Música de Natal';
  el.innerHTML = `<button type="button" class="musica-botao" aria-pressed="false"><span class="notas" aria-hidden="true"><i></i><i></i><i></i></span><span data-rotulo>Ouvir ${rotulo.toLowerCase()}</span></button>
  <label class="musica-volume"><svg class="i" aria-hidden="true"><use href="#i-som"></use></svg><span class="sr">Volume</span><input type="range" min="0" max="1" step="0.05" value="${vol}"></label>`;
  el.hidden = false;
  const botao = el.querySelector('button'), faixa = el.querySelector('input');
  botao.addEventListener('click', async () => {
    const ligar = botao.getAttribute('aria-pressed') !== 'true';
    if (ligar) { try { await player.iniciar(); } catch { return; } } else player.parar();
    botao.setAttribute('aria-pressed', String(ligar));
    el.classList.toggle('tocando', ligar);
    el.querySelector('[data-rotulo]').textContent = ligar ? 'Pausar música' : `Ouvir ${rotulo.toLowerCase()}`;
  });
  faixa.addEventListener('input', () => { player.definirVolume(Number(faixa.value)); localStorage.setItem('lvip-volume', faixa.value); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && el.classList.contains('tocando')) botao.click(); });
}
