# Art Jigsaw

Interactive interlocking jigsaw puzzle for paintings and photos.  
Vector clip-path pieces, classic / round / square shapes, group snapping, touch + desktop.

Built for **Cloudflare Pages** (static site — no build step).

## Package layout

```
jigsaw-cloudflare/
├── index.html          # Entry point
├── css/
│   └── styles.css
├── js/
│   └── puzzle.js       # Game logic (self-contained, no dependencies)
├── _headers            # Security + cache headers
├── _redirects          # SPA fallback
├── wrangler.toml       # Optional Wrangler config
└── README.md
```

No npm packages required. Pure HTML / CSS / vanilla JS.

## Deploy to Cloudflare Pages

### Option A — Dashboard (fastest)

1. Zip this folder **or** push it to a GitHub/GitLab repo.
2. Go to [Cloudflare Dashboard → Pages](https://dash.cloudflare.com/?to=/:account/pages).
3. **Create a project** → Connect to Git *or* **Upload assets**.
4. If uploading: select the contents of this folder (so `index.html` is at the root of the upload).
5. Build settings (static, no build):
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` or `.`
6. Deploy. You’ll get a `*.pages.dev` URL.

### Option B — Wrangler CLI

```bash
# Install once
npm install -g wrangler
# or: npx wrangler

# Login
wrangler login

# From inside this folder:
wrangler pages deploy . --project-name=art-jigsaw
```

Subsequent deploys:

```bash
wrangler pages deploy . --project-name=art-jigsaw
```

### Option C — Git integration

1. Put this folder at the root of a repo (or set **Root directory** in Pages settings).
2. Connect the repo in Cloudflare Pages.
3. Build command: empty  
   Output directory: `/` (or the folder name if nested).

## Local preview

Any static server works:

```bash
# Python
python -m http.server 8080

# Node
npx serve .

# PHP
php -S localhost:8080
```

Open `http://localhost:8080`.

## Usage notes

- **File upload** is recommended (avoids CORS issues with external image URLs).
- External URLs only work if the remote host sends `Access-Control-Allow-Origin` headers.
- Touch: drag pieces · 1-finger pan · pinch zoom.
- Desktop: scroll zoom · middle-click pan · left-drag pieces.

## Custom domain

In Cloudflare Pages → your project → **Custom domains** → add your domain (e.g. `puzzle.gaule.art`).

## License

Use freely for the GauLe / family art site and personal projects.
