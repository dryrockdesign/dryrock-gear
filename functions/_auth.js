// Shared auth helpers — pure Web Crypto, no npm dependencies.
// VERSION: 2026-05-24-utf8fix-2  (visible marker to confirm the live build)
// All base64 operations are byte-based, so btoa NEVER receives a raw Unicode
// string (which would throw "btoa Latin1 range" on Turkish names like Bartuğ).

const enc = new TextEncoder();
const dec = new TextDecoder();

// base64url from raw bytes — chunked to avoid call-stack limits on big buffers
function bytesToB64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < arr.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, arr.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// base64url from a STRING — UTF-8 encode FIRST (this is the key fix)
const b64urlStr = (str) => bytesToB64url(enc.encode(String(str)));
// raw bytes alias used for signatures
const b64url = (buf) => bytesToB64url(new Uint8Array(buf));
// decode base64url STRING back to UTF-8 text
function fromB64url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
}

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
  if (b64url(expected) !== parts[2]) return null;
  let body;
  try { body = JSON.parse(fromB64url(parts[1])); } catch { return null; }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

export function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setCookieHeader(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function randomState() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return b64url(a.buffer);
}
