// Spustit v kartě s Google Mapami: vrátí nasbírané záznamy ve formátu pro prevod.py
// (id|název|telefon|web|hodiny|kategorie), dny zkrácené na Po–Ne.
(() => {
  const D = { pondělí: 'Po', úterý: 'Út', středa: 'St', čtvrtek: 'Čt', pátek: 'Pá', sobota: 'So', neděle: 'Ne' };
  const r = JSON.parse(localStorage.getItem('najdiRES') || '[]').filter((x) => x[3] || x[7]);
  return r
    .map((x) =>
      [x[0], x[3] || x[2], x[4], x[5].replace(/^https?:\/\//, '').replace(/\/$/, ''), x[6].replace(/pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle/g, (d) => D[d]), x[8] || ''].join('|'),
    )
    .join('\n');
})();
