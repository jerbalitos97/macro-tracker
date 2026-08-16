# Deployment

**Tuotanto päivittyy automaattisesti, kun `main`-haaraan pushataan.** Käsin
buildaamista tai `vercel --prod`-komentoa ei tarvita.

Automaatti vaatii yhden kertaluontoisen kytkennän — valitse jompikumpi, älä
molempia (muuten jokainen push deployaa kahdesti):

**A. Vercelin oma Git-integraatio (suositeltu, ei salaisuuksia)**
Vercel → projekti → Settings → Git → Connect `jerbalitos97/macro-tracker`.
Tämän jälkeen Vercel buildaa ja julkaisee jokaisen `main`-pushin itse, ja
`.github/workflows/deploy.yml` jää lepäämään. Aseta lisäksi repositoryyn
muuttuja `DEPLOY_TARGET=vercel-git` (Settings → Secrets and variables →
Actions → Variables), niin workflow ei edes käynnisty.

**B. GitHub Actions (`.github/workflows/deploy.yml`, jo repossa)**
Lisää kolme salaisuutta (Settings → Secrets and variables → Actions):

| Secret | Mistä |
| --- | --- |
| `VERCEL_TOKEN` | vercel.com/account/tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` (`vercel link`) |
| `VERCEL_PROJECT_ID` | sama tiedosto |

Workflow tarkistaa tokenin olemassaolon ensin, joten ilman salaisuuksia se
ohittaa deployn siististi eikä kaadu punaiseksi.

Muista bumpata `public/sw.js`:n `CACHE`-versio kun julkaiset — service worker
tarjoilee vanhaa buildia kunnes cachen nimi vaihtuu.

---

## Muut alustat

Kaikki alla olevat vaatii vain `npm run build` → staattisten tiedostojen jako `dist/`-kansiosta.

---

## Cloudflare Pages (suositeltu – ilmainen)

1. Push repo GitHubiin
2. Cloudflare Dashboard → Pages → Connect to Git
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Valmis – HTTPS automaattisesti, CDN globaalisti

---

## Netlify (ilmainen)

```sh
npm install -g netlify-cli
npm run build
netlify deploy --prod --dir=dist
```

Tai drag-and-drop `dist/`-kansio Netlify-dashboardiin.

---

## GitHub Pages

```sh
npm run build
# Lisää gh-pages-paketti tai kopioi dist/ gh-pages-branchiin manuaalisesti
```

Vite-config: lisää `base: '/repo-nimi/'` jos ei ole root-domain.

---

## Vercel käsin (varajärjestelmä, jos automaatti on rikki)

```sh
npm install -g vercel
npm run build
vercel --prod
```

---

## Lokaali testaus tuotantobuildista

```sh
npm run build
npm run preview
# → http://localhost:4173
```

---

## Huomioita

- Ei backendiä, ei tietokantaa, ei autentikointia
- Kaikki data on käyttäjän selaimessa (localStorage)
- Service worker tarjoaa offline-tuen ensimmäisen latauksen jälkeen
- HTTPS vaaditaan PWA:n ja service workerin toimintaan (kaikki yllä olevat tarjoavat sen ilmaiseksi)
