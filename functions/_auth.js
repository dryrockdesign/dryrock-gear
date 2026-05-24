// Shared auth helpers — pure Web Crypto, no npm dependencies.
// Used by all /api functions running on Cloudflare Pages.

const enc = new TextEncoder();
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (str) =>
  btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) =>
  atob(s.replace(/-/g, "+").replace(/_/g, "/"));

// ---- HMAC-SHA256 signed token (a minimal JWT) ----
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"]
  );
}

export async function signSession(payload, secret, ttlSeconds = 60 * 60 * 24 * 7) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const h = b64urlStr(JSON.stringify(header));
  const p = b64urlStr(JSON.stringify(body));
  const data = `${h}.${p}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

export async function verifySession(token, secret) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const key = await hmacKey(secret);
  const expected = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const expB64 = b64url(expected);
  if (expB64 !== parts[2]) return null;             // signature mismatch
  let body;
  try { body = JSON.parse(fromB64url(parts[1])); } catch { return null; }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null; // expired
  return body;
}

// ---- cookie helpers ----
export function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setCookieHeader(name, value, maxAge) {
  // HttpOnly = JS can't read it (protects the token); Secure = HTTPS only.
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// ---- random state for CSRF protection during OAuth ----
export function randomState() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return b64url(a.buffer);
}
