# Server-side export — setup (adds to the Patreon gate you already have)

## What changed
- NEW  lib/gear-server.js        the gear math + STL writer (server only)
- NEW  functions/api/export-stl.js   POST endpoint, members-only
- EDIT protected/tool.html       button now POSTs params (see CLIENT_PATCH.md)

## Extra setup steps (on top of the gate's SETUP.md)

### 1. Add three.js as a dependency so Functions can bundle it
At the repo root create `package.json`:
```json
{ "name":"dryrock-gate","type":"module","dependencies":{ "three":"0.128.0" } }
```
Cloudflare Pages installs it automatically at build (esbuild tree-shakes it;
only the geometry math ships, well under the free 1 MB worker limit).

### 2. (optional) lock exports to your own site
Env var:  ALLOWED_ORIGIN = https://YOURPROJECT.pages.dev
Blocks other websites from calling your export endpoint (hotlinking).

### 3. Deploy. Done.
A signed-in member clicking "Download STL" now gets a file generated on the
server. Someone who copies tool.html gets a button that calls a server they
can't authenticate to → 401 → useless.

## §A vs §B — how copy-proof do you want to be?

### §A (this package)  ← recommended for a maker tool
Export is server-side and gated. Stops "copy the file, use forever offline".
The 3D PREVIEW still runs client-side, so a skilled person could read the
preview math and rebuild export themselves. Good enough for ~99% of users.

### §B (true copy-proof)  — optional, more work + latency
Move preview generation server-side too:
1. Add  POST /api/preview-mesh  that returns the mesh as a compact JSON
   (arrays of vertices+indices) — reuse gear-server.js, return positions
   instead of STL bytes.
2. In tool.html, DELETE all local geometry. On "Generate" (not on every slider
   drag — too many calls), POST params, receive the mesh, build a
   THREE.BufferGeometry from the returned arrays and display it.
3. Now ZERO valuable geometry exists in the browser. Copying gives you an empty
   shell that does nothing without a valid session.
Trade-off: preview is no longer instant (one round-trip per Generate), and you
use more function calls. For hobby scale still inside the free tier.

## PDF
Same pattern: move the jsPDF report build into POST /api/export-pdf, gate it,
return the PDF bytes. The browser just triggers the download.
