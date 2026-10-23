export const SITE = {
  nazev: 'Najdi kadeřnictví',
  domena: 'najdikadernictvi.cz',
  url: 'https://najdikadernictvi.cz',
  email: 'info@najdikadernictvi.cz',
  /**
   * Dokud je false, všechny stránky mají noindex a robots.txt blokuje roboty.
   * Přepnout na true po dokončení importu z rejstříku.
   */
  indexovat: false,
  /** Provozovatel webu (správce osobních údajů) – doplnit jméno/firmu, IČO a sídlo */
  provozovatel: {
    nazev: '',
    ico: '',
    sidlo: '',
  },
  /** Ověření v Google Search Console (obsah meta tagu google-site-verification) */
  googleOvereni: '',
  /** Ověření v Bing Webmaster Tools (msvalidate.01) */
  bingOvereni: '',
};
