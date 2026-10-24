// Vykreslení uložených salonů (oblíbené, historie) jako karet – na klientu, data z localStorage.
import type { UlozenySalon } from './oblibene';
import { inicializujSrdicka } from './oblibene';
import { doplnHodnoceni } from './hodnoceni-souhrn';

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const mono = (n: string) => {
  const sl = n.replace(/^(kadeřnictví|barbershop|barber|salon|studio|holičství)\s+/i, '').split(/[\s\-&]+/).filter(Boolean);
  return (sl.length > 1 ? sl[0][0] + sl[1][0] : (sl[0] ?? n).slice(0, 2)).toUpperCase();
};

export function kartaHtml(s: UlozenySalon): string {
  const data = esc(JSON.stringify(s));
  const foto =
    s.la && s.lo
      ? `<img class="viz__foto" src="/api/panorama.php?lat=${s.la}&lon=${s.lo}&s=maly&v=2" alt="" loading="lazy" onload="this.classList.add('ok')" onerror="this.remove()">`
      : '';
  return `<li class="karta">
    <button type="button" class="srdce srdce--ikona" data-oblibene="${data}" aria-pressed="false" title="Přidat do oblíbených"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4z"/></svg><span class="sr-only">Do oblíbených</span></button>
    <a href="${esc(s.u)}">
      <div class="viz-mini"><span>${esc(mono(s.n))}</span>${foto}</div>
      <span class="karta__typ">${s.b ? 'Barbershop' : 'Kadeřnictví'}</span>
      <h3 class="karta__nazev">${esc(s.n)}</h3>
      <p class="karta__adr">${esc(s.a)}</p>
      <span class="hod-mini" data-hod-id="${esc(s.id)}"><span class="hv" style="--p:0%"></span><span class="hod-mini__nic">Zatím bez hodnocení</span></span>
    </a>
  </li>`;
}

export function vykresli(el: HTMLElement, salony: UlozenySalon[]) {
  el.innerHTML = salony.map(kartaHtml).join('');
  inicializujSrdicka(el);
  doplnHodnoceni(el);
}
