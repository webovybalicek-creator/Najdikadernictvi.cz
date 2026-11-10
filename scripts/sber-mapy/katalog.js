// Spustit na https://najdikadernictvi.cz/ (javascript v prohlížeči). Postaví mapu „ulice|číslo|obec“ → id salonu
// z datových dlaždic webu a uloží ji do window.name (přežije přechod na Google Mapy v téže kartě).
(async () => {
  const norm = (s) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(ulice|tr|trida|nam|namesti)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
  const map = {};
  let n = 0;
  for (let la = 97; la <= 102; la++)
    for (let lo = 24; lo <= 38; lo++) {
      const r = await fetch(`/data/dlazdice/${la}_${lo}.json`);
      if (!r.ok) continue;
      const d = await r.json();
      const arr = Array.isArray(d) ? d : d.s || d.salony || Object.values(d)[0];
      for (const z of arr) {
        if (!Array.isArray(z)) continue;
        const m = (z[4] || '').match(/^(.*?)\s(\d+[a-z]?)(?:\/(\d+[a-z]?))?,\s*(?:\d{3}\s?\d{2}\s)?(.+)$/i);
        if (!m) continue;
        for (const c of [m[2], m[3]].filter(Boolean)) {
          map[norm(m[1]) + '|' + c.toLowerCase() + '|' + norm(m[4])] = z[8];
          n++;
        }
      }
    }
  window.name = 'KAT' + JSON.stringify(map);
  return 'keys ' + n;
})();
