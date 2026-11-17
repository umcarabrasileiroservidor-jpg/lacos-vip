// Efeitos visuais discretos das campanhas: neve (Natal) e brilhos dourados (Réveillon).
// Poucas partículas, pausa quando a aba não está visível e respeita "reduzir movimento".
export function iniciar(canvas, tema) {
  if (!canvas || canvas.dataset.ativo) return;
  canvas.dataset.ativo = '1';
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  const redimensionar = () => { W = innerWidth; H = innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  redimensionar();
  addEventListener('resize', redimensionar, { passive: true });
  const qtd = W < 700 ? 22 : 40;
  const natal = tema === 'natal';
  const novo = (topo) => ({
    x: Math.random() * W, y: topo ? -10 : Math.random() * H,
    r: natal ? 1.2 + Math.random() * 2.4 : 1 + Math.random() * 2,
    vy: natal ? 0.25 + Math.random() * 0.55 : 0.15 + Math.random() * 0.35,
    vx: (Math.random() - 0.5) * 0.3, f: Math.random() * Math.PI * 2, a: 0.35 + Math.random() * 0.5,
  });
  const ps = Array.from({ length: qtd }, () => novo(false));
  let ultimo = 0, raf;
  const desenhar = (t) => {
    raf = requestAnimationFrame(desenhar);
    if (t - ultimo < 33) return; // ~30 quadros por segundo
    ultimo = t;
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.f += 0.02; p.y += p.vy; p.x += p.vx + Math.sin(p.f) * 0.3;
      if (p.y > H + 10) Object.assign(p, novo(true));
      if (natal) {
        ctx.globalAlpha = p.a; ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(120,140,160,.5)'; ctx.shadowBlur = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else {
        const brilho = 0.5 + 0.5 * Math.sin(p.f * 3);
        ctx.globalAlpha = p.a * brilho; ctx.fillStyle = '#C9A04A'; ctx.shadowColor = '#F3DFA8'; ctx.shadowBlur = 6;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.f);
        const r = p.r * 1.6; ctx.beginPath();
        ctx.moveTo(0, -r * 2); ctx.lineTo(r * 0.4, -r * 0.4); ctx.lineTo(r * 2, 0); ctx.lineTo(r * 0.4, r * 0.4);
        ctx.lineTo(0, r * 2); ctx.lineTo(-r * 0.4, r * 0.4); ctx.lineTo(-r * 2, 0); ctx.lineTo(-r * 0.4, -r * 0.4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  };
  raf = requestAnimationFrame(desenhar);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(desenhar); });
}
