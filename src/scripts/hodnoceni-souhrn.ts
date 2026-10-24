// Doplní hvězdičky do výpisů: prvky [data-hod-id] dostanou průměr a počet hodnocení.
let souhrn: Promise<Record<string, [number, number]>> | null = null;

export function doplnHodnoceni(root: ParentNode = document) {
  const prvky = root.querySelectorAll<HTMLElement>('[data-hod-id]');
  if (!prvky.length) return;
  souhrn ??= fetch('/api/hodnoceni.php?souhrn=1')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  souhrn.then((s) => {
    prvky.forEach((el) => {
      const h = s[el.dataset.hodId!];
      if (!h) return;
      const [p, n] = h;
      el.innerHTML = `<span class="hv" style="--p:${(p / 5) * 100}%"></span><strong>${String(p).replace('.', ',')}</strong> (${n})`;
      el.setAttribute('aria-label', `Hodnocení ${String(p).replace('.', ',')} z 5, ${n}×`);
    });
  });
}
