// Tematická animace tlačítek: při najetí myší kolem tlačítka objede přerušovaná čára
// a na konci jemně spadne pár ustřižených vlasů.

const VLASY = [
  'M1 1 C 4 5, 2 9, 6 13',
  'M2 1 C 0 5, 6 8, 4 13',
  'M1 2 C 6 4, 3 10, 8 12',
];

const omezitPohyb =
  matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(hover: none)').matches;

function spadniVlasy(btn: HTMLElement) {
  const n = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const v = document.createElement('span');
    v.className = 'vlas';
    v.setAttribute('aria-hidden', 'true');
    v.innerHTML = `<svg viewBox="0 0 10 14"><path d="${VLASY[i % VLASY.length]}" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round"/></svg>`;
    const x = 8 + Math.random() * Math.max(10, btn.offsetWidth - 16);
    v.style.left = `${x}px`;
    v.style.top = `${btn.offsetHeight + 2}px`;
    btn.appendChild(v);
    const dx = (Math.random() - 0.5) * 24;
    const rot = (Math.random() - 0.5) * 140;
    v.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 0.75 },
        { transform: `translate(${dx * 0.6}px, 14px) rotate(${rot * 0.5}deg)`, opacity: 0.6, offset: 0.5 },
        { transform: `translate(${dx}px, 30px) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 1100 + Math.random() * 500, delay: i * 70, easing: 'cubic-bezier(0.3, 0.1, 0.4, 1)', fill: 'forwards' },
    ).onfinish = () => v.remove();
  }
}

let pocitadlo = 0;
const SVG = 'http://www.w3.org/2000/svg';

function priprav(btn: HTMLElement) {
  if (btn.dataset.nuzky) return;
  btn.dataset.nuzky = '1';
  // Přerušovaná čára kolem tlačítka: čárkovaný obrys odkrývaný maskou, která se „dokreslí“ dokola
  const id = `obrys-${++pocitadlo}`;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'btn__obrys');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><mask id="${id}"><rect class="btn__maska" pathLength="100" fill="none" stroke="#fff" stroke-width="4"/></mask></defs><rect class="btn__cara" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4" mask="url(#${id})"/>`;
  btn.append(svg);

  const rozmer = () => {
    const w = btn.offsetWidth + 10;
    const h = btn.offsetHeight + 10;
    const r = parseFloat(getComputedStyle(btn).borderTopLeftRadius) || 0;
    const rx = Math.min(h / 2, r + 5);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.querySelectorAll('rect').forEach((el) => {
      el.setAttribute('x', '0.5');
      el.setAttribute('y', '0.5');
      el.setAttribute('width', String(w - 1));
      el.setAttribute('height', String(h - 1));
      el.setAttribute('rx', String(rx));
    });
  };

  let bezi = false;
  btn.addEventListener('mouseenter', () => {
    if (bezi) return;
    bezi = true;
    rozmer();
    btn.classList.remove('is-obrys');
    void btn.offsetWidth; // restart animace
    btn.classList.add('is-obrys');
    setTimeout(() => spadniVlasy(btn), 620);
    setTimeout(() => (bezi = false), 1000);
  });
  btn.addEventListener('mouseleave', () => {
    setTimeout(() => {
      if (!btn.matches(':hover')) btn.classList.remove('is-obrys');
    }, 600);
  });
}

export function nuzkyNaTlacitka(root: ParentNode = document) {
  if (omezitPohyb) return;
  root.querySelectorAll<HTMLElement>('.btn').forEach(priprav);
}
