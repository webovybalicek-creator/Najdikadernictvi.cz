# Najdikadernictvi.cz

Katalog kadeřnictví a barbershopů v ČR. Statický web postavený na [Astro](https://astro.build).

## Vývoj

```bash
npm install
npm run dev      # lokální náhled
npm run build    # sestavení do složky dist/
```

Vyžaduje Node.js 24.

## Deploy

Každý push do větve `main` web sestaví a přes FTPS nahraje na hosting (`.github/workflows/deploy.yml`).

Potřebné GitHub secrets (*Settings → Secrets and variables → Actions → Secrets*):

- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`

Volitelná proměnná (*… → Variables*): `FTP_DIR` – cílová složka na serveru, výchozí `./`.

## Stav

Web je ve vývoji: `noindex` + `robots.txt` blokují indexaci až do spuštění.
