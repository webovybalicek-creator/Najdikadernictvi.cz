// Tematická animace tlačítek: při najetí myší nůžky přestřihnou čárkovanou linku
// pod tlačítkem a na konci jemně spadne pár ustřižených vlasů.

const NUZKY = `<svg viewBox="0 0 18 18" aria-hidden="true">
  <g class="cepel cepel--a"><circle cx="3.2" cy="4.2" r="2.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.1 5.6 17 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></g>
  <g class="cepel cepel--b"><circle cx="3.2" cy="13.8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.1 12.4 17 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></g>
</svg>`;

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
    const x = btn.offsetWidth - 10 - Math.random() * Math.min(60, btn.offsetWidth * 0.5);
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

function priprav(btn: HTMLElement) {
  if (btn.dataset.nuzky) return;
  btn.dataset.nuzky = '1';
  const cut = document.createElement('span');
  cut.className = 'btn__cut';
  cut.setAttribute('aria-hidden', 'true');
  const nuzky = document.createElement('span');
  nuzky.className = 'btn__nuzky';
  nuzky.setAttribute('aria-hidden', 'true');
  nuzky.innerHTML = NUZKY;
  btn.append(cut, nuzky);

  let bezi = false;
  btn.addEventListener('mouseenter', () => {
    if (bezi) return;
    bezi = true;
    btn.style.setProperty('--sirka', `${btn.offsetWidth}px`);
    btn.classList.remove('is-strih');
    void btn.offsetWidth; // restart animace
    btn.classList.add('is-strih');
    setTimeout(() => spadniVlasy(btn), 520);
    setTimeout(() => (bezi = false), 900);
  });
  btn.addEventListener('mouseleave', () => {
    setTimeout(() => {
      if (!btn.matches(':hover')) btn.classList.remove('is-strih');
    }, 700);
  });
}

export function nuzkyNaTlacitka(root: ParentNode = document) {
  if (omezitPohyb) return;
  root.querySelectorAll<HTMLElement>('.btn').forEach(priprav);
}
