// Oblíbené salony a naposledy prohlížené – ukládá se jen v prohlížeči (localStorage), bez cookies a registrace.

export interface UlozenySalon {
  id: string;
  u: string; // URL
  n: string; // název
  a: string; // adresa
  b?: 1; // barbershop
  la?: number;
  lo?: number;
  c?: number; // čas uložení
}

const KLIC_OBLIBENE = 'nk-oblibene';
const KLIC_HISTORIE = 'nk-historie';
const MAX_HISTORIE = 8;

function nacti(klic: string): UlozenySalon[] {
  try {
    const v = JSON.parse(localStorage.getItem(klic) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function uloz(klic: string, data: UlozenySalon[]) {
  try {
    localStorage.setItem(klic, JSON.stringify(data));
  } catch {
    /* soukromý režim apod. – funkce prostě nebude trvalá */
  }
}

export const oblibene = () => nacti(KLIC_OBLIBENE);
export const historie = () => nacti(KLIC_HISTORIE);
export const jeOblibeny = (id: string) => oblibene().some((s) => s.id === id);

export function prepniOblibeny(s: UlozenySalon): boolean {
  const vse = oblibene();
  const i = vse.findIndex((x) => x.id === s.id);
  if (i >= 0) vse.splice(i, 1);
  else vse.unshift({ ...s, c: Date.now() });
  uloz(KLIC_OBLIBENE, vse);
  window.dispatchEvent(new CustomEvent('nk-oblibene'));
  return i < 0;
}

export function odeberOblibeny(id: string) {
  uloz(
    KLIC_OBLIBENE,
    oblibene().filter((s) => s.id !== id),
  );
  window.dispatchEvent(new CustomEvent('nk-oblibene'));
}

export function zapisHistorii(s: UlozenySalon) {
  const vse = historie().filter((x) => x.id !== s.id);
  vse.unshift({ ...s, c: Date.now() });
  uloz(KLIC_HISTORIE, vse.slice(0, MAX_HISTORIE));
}

/** Srdíčka: <button data-oblibene='{"id":…}'> */
export function inicializujSrdicka(root: ParentNode = document) {
  const nastav = (btn: HTMLButtonElement, on: boolean) => {
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Odebrat z oblíbených' : 'Přidat do oblíbených';
    const t = btn.querySelector('[data-srdce-text]');
    if (t) t.textContent = on ? 'V oblíbených' : 'Do oblíbených';
  };
  root.querySelectorAll<HTMLButtonElement>('[data-oblibene]').forEach((btn) => {
    if (btn.dataset.init) return;
    btn.dataset.init = '1';
    const s = JSON.parse(btn.dataset.oblibene!) as UlozenySalon;
    nastav(btn, jeOblibeny(s.id));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const on = prepniOblibeny(s);
      nastav(btn, on);
      btn.classList.remove('pulz');
      void btn.offsetWidth;
      if (on) btn.classList.add('pulz');
    });
    window.addEventListener('nk-oblibene', () => nastav(btn, jeOblibeny(s.id)));
  });
}

/** Počet oblíbených v hlavičce */
export function inicializujPocitadlo() {
  const el = document.querySelector<HTMLElement>('[data-pocet-oblibenych]');
  if (!el) return;
  const obnov = () => {
    const n = oblibene().length;
    el.textContent = n ? String(n) : '';
    el.hidden = !n;
  };
  obnov();
  window.addEventListener('nk-oblibene', obnov);
  window.addEventListener('storage', obnov);
}

// ---------------------------------------------------------------- porovnání (max. 3 salony)
const KLIC_POROVNAT = 'nk-porovnat';
export const MAX_POROVNAT = 3;
export const porovnani = () => nacti(KLIC_POROVNAT);
export const jeVPorovnani = (id: string) => porovnani().some((s) => s.id === id);

/** Vrací true = přidáno, false = odebráno, null = plno */
export function prepniPorovnani(s: UlozenySalon): boolean | null {
  const vse = porovnani();
  const i = vse.findIndex((x) => x.id === s.id);
  if (i >= 0) vse.splice(i, 1);
  else if (vse.length >= MAX_POROVNAT) return null;
  else vse.push({ ...s, c: Date.now() });
  uloz(KLIC_POROVNAT, vse);
  window.dispatchEvent(new CustomEvent('nk-porovnat'));
  return i < 0;
}
export function odeberZPorovnani(id: string) {
  uloz(
    KLIC_POROVNAT,
    porovnani().filter((s) => s.id !== id),
  );
  window.dispatchEvent(new CustomEvent('nk-porovnat'));
}

/** Tlačítka <button data-porovnat='{"id":…}'> */
export function inicializujPorovnani(root: ParentNode = document) {
  const nastav = (btn: HTMLButtonElement, on: boolean) => {
    btn.setAttribute('aria-pressed', String(on));
    const t = btn.querySelector('[data-porovnat-text]');
    if (t) t.textContent = on ? 'V porovnání' : 'Porovnat';
  };
  root.querySelectorAll<HTMLButtonElement>('[data-porovnat]').forEach((btn) => {
    if (btn.dataset.initP) return;
    btn.dataset.initP = '1';
    const s = JSON.parse(btn.dataset.porovnat!) as UlozenySalon;
    nastav(btn, jeVPorovnani(s.id));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = prepniPorovnani(s);
      if (r === null) {
        const t = btn.querySelector('[data-porovnat-text]');
        if (t) {
          t.textContent = `Max. ${MAX_POROVNAT} salony`;
          setTimeout(() => nastav(btn, jeVPorovnani(s.id)), 1600);
        }
        return;
      }
      nastav(btn, r);
    });
    window.addEventListener('nk-porovnat', () => nastav(btn, jeVPorovnani(s.id)));
  });
}

/** Plovoucí lišta „Porovnat (n)“ */
export function inicializujListuPorovnani() {
  if (location.pathname.startsWith('/porovnat')) return;
  const lista = document.createElement('div');
  lista.className = 'por-lista';
  lista.hidden = true;
  lista.innerHTML = `<span data-por-text></span><a class="btn" href="/porovnat/">Porovnat</a><button type="button" class="por-lista__x" aria-label="Zrušit porovnání">×</button>`;
  document.body.appendChild(lista);
  const obnov = () => {
    const n = porovnani().length;
    lista.hidden = n === 0;
    lista.querySelector('[data-por-text]')!.textContent =
      n === 1 ? '1 salon k porovnání, přidejte další' : `${n} salony k porovnání`;
  };
  lista.querySelector('.por-lista__x')!.addEventListener('click', () => {
    uloz(KLIC_POROVNAT, []);
    window.dispatchEvent(new CustomEvent('nk-porovnat'));
  });
  obnov();
  window.addEventListener('nk-porovnat', obnov);
  window.addEventListener('storage', obnov);
}
