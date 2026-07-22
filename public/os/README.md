# JARVIS CEO OS — interfața (redesign)

Noua interfață CEO OS trăiește la **`/os.html`** și este 100% adițională:
nu modifică backend-ul, HUD-ul vechi (`/index.html`) sau Command Center-ul
vechi (`/ceo.html`), care rămân funcționale până la migrarea completă.

## Contractul cu creierul JARVIS

Interfața consumă EXCLUSIV API-urile existente (PIN `x-jarvis-key`, identic cu
HUD-ul). Straturile sunt separate ca dezvoltarea backend/frontend să poată
continua în paralel:

```
JARVIS INTELLIGENCE (src/ceo, src/observationEngine, ...)
        ↓  API existente: /api/ceo/*, /api/chat, /api/history
os/api.js          — transport + PIN + cache scurt + mod DEMO
os/adapters.js     — VIEW-MODELE semantice (spec §32): CompanyState,
                     JarvisState, AttentionEpisode, NeedYouItem,
                     DomainReality, DataGap, orbita companiei
os/views/*         — TODAY · JARVIS · COMPANY · WORK · ORGANISM
os/components/*    — JarvisCore, CompanyOrbit, OrbitalHome, primitive UI
```

Dacă backend-ul schimbă forma unui răspuns, singurul loc de adaptat este
`adapters.js` (plus, rar, view-ul în cauză). Nu există logică de business în UI.

## Reguli respectate

- **Zero date inventate.** Ce lipsește se afișează ca stare semantică
  (`DATA UNAVAILABLE`, `NECUNOSCUT`, freshness, confidence), nu ca cifră.
- **Mod demo** doar explicit (`/os.html?demo=1`), cu banner permanent
  „DATE DEMO" și scrieri blocate; fixtures în `os/mock/fixtures.js`.
- **Permisiuni**: UI-ul nu adaugă nicio scriere nouă — folosește doar
  endpoint-urile existente (decizii propuneri, solduri, mapare identități,
  ciclu nervous shadow-safe).
- **Productizare**: numele companiei și oamenii vin din `/api/ceo/manifest`
  (COMPANY instance), nu sunt hardcodate în nucleu.
- **Progressive enhancement**: SVG + CSS, zero dependințe, zero build step;
  `prefers-reduced-motion` respectat; dark flagship + light first-class
  (auto / comutator manual).

## Structură

- `os.html` — shell (gate PIN, topbar, nav, ask-bar, drawer)
- `os/tokens.css` — design tokens (culori semantice, tipografie, motion)
- `os/os.css` — stiluri aplicație (desktop HUD, mobil orbital, componente)
- `os/main.js` — boot, store, router hash, refresh (2 min, doar tab vizibil)
