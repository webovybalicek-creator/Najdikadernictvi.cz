export const SITE = {
  nazev: 'Najdi kadeřnictví',
  domena: 'najdikadernictvi.cz',
  url: 'https://najdikadernictvi.cz',
  email: 'info@najdikadernictvi.cz',
  /**
   * Dokud je false, všechny stránky mají noindex a robots.txt blokuje roboty.
   * Přepnout na true po dokončení importu z rejstříku.
   */
  indexovat: true,
  /** Provozovatel webu (správce osobních údajů) – doplnit jméno/firmu, IČO a sídlo */
  provozovatel: {
    nazev: 'Vladimír Fischer',
    ico: '03051820',
    sidlo: 'Nerudova 765/10, 251 01 Říčany',
    zapis: 'zapsaný v živnostenském rejstříku vedeném Městským úřadem Říčany',
    telefon: '+420 723 933 774',
    /** Hlavní činnost provozovatele (tvorba webů) – posiluje důvěryhodnost na stránce O webu */
    web: 'https://www.webovybalicek.cz',
  },
  /** Ověření v Google Search Console (obsah meta tagu google-site-verification) */
  googleOvereni: '',
  /** Ověření v Bing Webmaster Tools (msvalidate.01) */
  bingOvereni: '',
  /**
   * Google AdSense – ID vydavatele ve tvaru „ca-pub-1234567890123456“.
   * Prázdné = reklama i souhlas s cookies jsou vypnuté.
   * Souhlas s cookies (GDPR, IAB TCF) zajišťuje certifikovaný CMP Googlu:
   * AdSense → Ochrana soukromí a zprávy → Evropské předpisy (GDPR) – vytvořit a publikovat zprávu.
   */
  adsense: 'ca-pub-4136470374910853',
};
