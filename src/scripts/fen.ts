// Úvodní část: při rychlém pohybu myší „foukne fén“ – za kurzorem se mihne pár teplých
// zvlněných proudů vzduchu a rozmazané barevné skvrny v pozadí se krátce posunou ve směru pohybu.
// Jen počítač s myší, vypnuto při omezení animací.

interface Proud {
  x: number;
  y: number;
  ux: number; // směr pohybu (jednotkový vektor)
  uy: number;
  posun: number; // kolmé odsazení od dráhy kurzoru
  delka: number;
  faze: number;
  vlna: number;
  zrozen: number;
  zivot: number;
  barva: string;
  sila: number;
}

const BARVY = ['255, 106, 43', '255, 179, 64', '255, 140, 60'];
const PRAH = 1.4; // px/ms – od jaké rychlosti fouká
const ZIVOT = 650;

export function fen(hero: HTMLElement) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const platno = document.createElement('canvas');
  platno.className = 'hero__fen';
  platno.setAttribute('aria-hidden', 'true');
  hero.prepend(platno);
  const ctx = platno.getContext('2d');
  if (!ctx) return;

  let w = 0;
  let h = 0;
  const velikost = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = hero.clientWidth;
    h = hero.clientHeight;
    platno.width = Math.round(w * dpr);
    platno.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  velikost();
  new ResizeObserver(velikost).observe(hero);

  const proudy: Proud[] = [];
  let posledni: { x: number; y: number; t: number } | null = null;
  let posledniFouk = 0;
  // posun pozadí (pružina)
  let fx = 0;
  let fy = 0;
  let vx = 0;
  let vy = 0;
  let bezi = false;

  const foukni = (x: number, y: number, ux: number, uy: number, rychlost: number, t: number) => {
    const n = 3 + Math.round(Math.min(2, (rychlost - PRAH) * 1.5));
    for (let i = 0; i < n; i++) {
      proudy.push({
        x: x - ux * (20 + Math.random() * 30),
        y: y - uy * (20 + Math.random() * 30),
        ux,
        uy,
        posun: (i - (n - 1) / 2) * (9 + Math.random() * 6),
        delka: 70 + Math.random() * 70 + rychlost * 25,
        faze: Math.random() * Math.PI * 2,
        vlna: 3 + Math.random() * 4,
        zrozen: t + i * 25,
        zivot: ZIVOT + Math.random() * 250,
        barva: BARVY[i % BARVY.length],
        sila: Math.min(1, 0.45 + (rychlost - PRAH) * 0.35),
      });
    }
    if (proudy.length > 60) proudy.splice(0, proudy.length - 60);
    // impuls pozadí ve směru foukání
    const imp = Math.min(3, rychlost) * 9;
    vx += ux * imp;
    vy += uy * imp;
    spust();
  };

  hero.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = hero.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const t = performance.now();
      if (posledni) {
        const dt = Math.max(1, t - posledni.t);
        const dx = x - posledni.x;
        const dy = y - posledni.y;
        const d = Math.hypot(dx, dy);
        const rychlost = d / dt;
        if (rychlost > PRAH && d > 12 && t - posledniFouk > 90) {
          posledniFouk = t;
          foukni(x, y, dx / d, dy / d, rychlost, t);
        }
      }
      posledni = { x, y, t };
    },
    { passive: true },
  );
  hero.addEventListener('pointerleave', () => (posledni = null));

  const kresli = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = proudy.length - 1; i >= 0; i--) {
      const p = proudy[i];
      const vek = (t - p.zrozen) / p.zivot;
      if (vek >= 1) {
        proudy.splice(i, 1);
        continue;
      }
      if (vek < 0) continue;
      // proud se rozvine dopředu, pak odplouvá a mizí
      const ease = 1 - Math.pow(1 - vek, 3);
      const unos = ease * 60;
      const delka = p.delka * Math.min(1, vek * 2.2);
      const alfa = p.sila * (vek < 0.25 ? vek / 0.25 : 1 - (vek - 0.25) / 0.75) * 0.55;
      const nx = -p.uy;
      const ny = p.ux;
      const sx = p.x + p.ux * unos + nx * p.posun;
      const sy = p.y + p.uy * unos + ny * p.posun;
      const ex = sx + p.ux * delka;
      const ey = sy + p.uy * delka;
      const g = ctx.createLinearGradient(sx, sy, ex, ey);
      g.addColorStop(0, `rgba(${p.barva}, 0)`);
      g.addColorStop(0.55, `rgba(${p.barva}, ${alfa})`);
      g.addColorStop(1, `rgba(${p.barva}, 0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const kroky = 18;
      for (let k = 0; k <= kroky; k++) {
        const s = k / kroky;
        const amp = p.vlna * Math.sin(s * Math.PI) * (0.6 + vek);
        const o = Math.sin(s * Math.PI * 2.2 + p.faze + vek * 6) * amp;
        const px = sx + p.ux * delka * s + nx * o;
        const py = sy + p.uy * delka * s + ny * o;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // pružina pozadí
    vx += -fx * 0.06;
    vy += -fy * 0.06;
    vx *= 0.82;
    vy *= 0.82;
    fx += vx;
    fy += vy;
    fx = Math.max(-60, Math.min(60, fx));
    fy = Math.max(-40, Math.min(40, fy));
    hero.style.setProperty('--fx', `${fx.toFixed(1)}px`);
    hero.style.setProperty('--fy', `${fy.toFixed(1)}px`);

    const klid = !proudy.length && Math.abs(fx) < 0.2 && Math.abs(fy) < 0.2 && Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05;
    if (klid) {
      bezi = false;
      fx = fy = vx = vy = 0;
      hero.style.setProperty('--fx', '0px');
      hero.style.setProperty('--fy', '0px');
      ctx.clearRect(0, 0, w, h);
      return;
    }
    requestAnimationFrame(kresli);
  };
  const spust = () => {
    if (bezi) return;
    bezi = true;
    requestAnimationFrame(kresli);
  };
}
