# Deploy Readiness Checklist — Embed Widget (Vercel)

## 1) Build output

- **Vite config** (`embed/vite.config.js`):
  - Entry: `./src/main.jsx`
  - Lib: `formats: ['iife']`, `fileName: () => 'ticket-embed.js'`, `name: 'TicketWidget'`
  - `rollupOptions.output.inlineDynamicImports: true` → single file, no chunks
  - `outDir: 'dist'`
- **Result:** `npm run build` produces **`embed/dist/ticket-embed.js`** and, via postbuild, **`embed/dist/index.html`** (copy of `index.production.html`).

## 2) Production HTML

- **Repo `embed/index.html`** is for **dev only** (script: `/src/main.jsx`). Do not deploy it as the production page.
- **Production test page:** Edit **`embed/index.production.html`** in the repo (loads **`./ticket-embed.js`**). After `vite build`, `scripts/postbuild.js` copies it to **`embed/dist/index.html`**, so when the site root is `dist/`, `/` serves that test page and the script URL is **`/ticket-embed.js`**.

## 3) Verify locally

```bash
cd embed
npm install
npm run build
npm run preview
```

- Open `http://localhost:4173/` → test page with widget container.
- Open `http://localhost:4173/ticket-embed.js` → script returns 200 and JS content.
- In browser console on the test page: `window.TicketWidget` should be `{ mount, initializeWidget }`.

## 4) Global API

- **`window.TicketWidget`** exists after the script runs.
- **Auto-init:** On load, the script finds all elements with `id` starting with `"ticket-widget"` and `data-event-id`, and mounts the widget in each (Shadow DOM). No other elements are touched.
- **Programmatic:**
  - `TicketWidget.mount({ target: HTMLElement, eventId: string, theme?: 'light'|'dark' })`
  - `TicketWidget.initializeWidget()` — re-scans the document for `[id^="ticket-widget"]` and mounts.

## 5) Embed deployment notes

| Item | Status |
|------|--------|
| **Base path** | `base: '/'` in Vite; script is loaded from site root (e.g. `/ticket-embed.js`). |
| **Single file** | `inlineDynamicImports: true`; no extra chunks. |
| **CSS** | Inlined into the bundle (imported as `?raw` in main.jsx); no separate CSS file. |
| **CORS** | Not required for loading the script. If the widget later fetches your API from another origin, the API must allow the embed origin. |
| **Console** | `drop_console` removed; logs remain for rollout debugging. |

## 6) Vercel settings

- **Root Directory:** `embed`
- **Output Directory:** `dist`  
  → Deployed site root = contents of `embed/dist/`, so **`/ticket-embed.js`** and **`/`** (index.html) work.
- **Build command:** `npm run build`
- **Install command:** `npm install`

## 7) Post-deploy URL

- Script: `https://<your-vercel-domain>/ticket-embed.js`
- Later (custom domain): `https://pricing.onlylocaltickets.com/ticket-embed.js`

## 8) Embed code (host page)

```html
<div id="ticket-widget-1" data-event-id="YOUR_TE_EVENT_ID"></div>
<script src="https://<your-vercel-domain>/ticket-embed.js"></script>
```

Optional programmatic mount:

```html
<div id="my-container"></div>
<script src="https://<your-vercel-domain>/ticket-embed.js"></script>
<script>
  TicketWidget.mount({ target: document.getElementById('my-container'), eventId: '12345', theme: 'light' });
</script>
```
