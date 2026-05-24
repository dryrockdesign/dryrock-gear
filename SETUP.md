# Dryrock Design — Patreon-gated Gear Studio (zero-cost setup)

Members sign in with Patreon; only active patrons reach the tool.
Stack: **Cloudflare Pages + Pages Functions** (free) + **Patreon OAuth** (free).
No server to run, no monthly cost. A custom domain is optional.

## Folder layout
```
index.html              ← public landing ("Sign in with Patreon")
denied.html             ← shown when membership can't be verified
protected/tool.html     ← the actual gear studio (never served directly)
functions/
  _auth.js              ← JWT + cookie helpers (Web Crypto, no deps)
  app.js                ← GET /app  (the gate: verifies session, serves tool)
  protected/_middleware.js ← 404s any direct hit to /protected/*
  api/login.js          ← GET /api/login    → Patreon consent
  api/callback.js       ← GET /api/callback → token + membership check → session
  api/logout.js         ← GET /api/logout
```

## One-time setup (≈20 min)

### 1. Register a Patreon OAuth client  (free)
- Go to: https://www.patreon.com/portal/registration/register-clients
- Create a client. Copy **Client ID** and **Client Secret**.
- Redirect URI: `https://YOURPROJECT.pages.dev/api/callback`
  (add the custom-domain version too if you use one later)

### 2. Put this folder on GitHub
- Create a repo, push these files.

### 3. Create a Cloudflare Pages project  (free, no card)
- dash.cloudflare.com → Workers & Pages → Create → Pages → connect the repo.
- Build command: (none) · Output directory: `/` (root).
- Deploy. You get `https://YOURPROJECT.pages.dev`.

### 4. Add environment variables  (Settings → Environment variables → Production)
- `PATREON_CLIENT_ID`      = (from step 1)
- `PATREON_CLIENT_SECRET`  = (from step 1)
- `SESSION_SECRET`         = a long random string (e.g. run: openssl rand -hex 32)
- `MIN_CENTS`              = 0 (or e.g. 500 to require a $5+ tier)
- Redeploy after saving.

### 5. Edit the two placeholder links
- In `index.html` and `denied.html`, replace `YOUR_CAMPAIGN` with your Patreon URL slug.

### 6. Share with members
- In your Patreon post, link to: `https://YOURPROJECT.pages.dev/`
- Members click "Sign in with Patreon" → consent → land in the tool at `/app`.

## How protection works
- The tool HTML lives in `/protected/` and is **404'd** for any public request.
- `/app` is a function: it checks the signed session cookie; only then does it
  fetch the tool internally (via the ASSETS binding) and return it.
- The session is an **HMAC-signed JWT** in an HttpOnly cookie — JS can't read or
  forge it (signing happens server-side with SESSION_SECRET).
- Secrets never touch the browser.

## Notes / limits
- Cloudflare free: 100k function requests/day — far beyond hobby scale.
- A determined member who is signed in could still save the page they see; this
  stops *non-members* and casual sharing, which is the realistic threat.
  For stronger protection, move STL/PDF generation server-side later.
- Membership data can lag ~1 min after a new pledge (Patreon side).
