# Deployment

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

## Vercel (ilmainen)

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
