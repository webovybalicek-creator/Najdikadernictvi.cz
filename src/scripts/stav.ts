// Živý stav „otevřeno / zavřeno“ podle času v Praze.
// Prvky: [data-oh] s JSON týdnem (index 0 = pondělí, intervaly v minutách).

const DNY = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const hhmm = (m: number) => `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;

export function prahaTed(): { den: number; min: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const den = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return { den, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function stav(tyden: [number, number][][]): { open: boolean; text: string } {
  const { den, min } = prahaTed();
  const dnes = tyden[den] ?? [];
  const ted = dnes.find(([a, b]) => min >= a && min < b);
  if (ted) return { open: true, text: `Otevřeno do ${hhmm(ted[1])}` };
  const pozdeji = dnes.find(([a]) => a > min);
  if (pozdeji) return { open: false, text: `Zavřeno, otevírá v ${hhmm(pozdeji[0])}` };
  for (let i = 1; i <= 7; i++) {
    const d = (den + i) % 7;
    if (tyden[d]?.length) {
      const kdy = i === 1 ? 'zítra' : DNY[d];
      return { open: false, text: `Zavřeno, otevírá ${kdy} v ${hhmm(tyden[d][0][0])}` };
    }
  }
  return { open: false, text: 'Zavřeno' };
}

export function aplikujStav(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-oh]').forEach((el) => {
    try {
      const s = stav(JSON.parse(el.dataset.oh!));
      const out = el.querySelector<HTMLElement>('.stav') ?? el;
      out.textContent = s.text;
      out.dataset.stav = s.open ? 'open' : 'closed';
      el.dataset.open = s.open ? '1' : '0';
    } catch {
      /* neplatná data – nic nezobrazit */
    }
  });
}
