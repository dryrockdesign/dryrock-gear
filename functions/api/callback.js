// GET /api/callback?code=...&state=...
// Patreon redirects here. We exchange the code, read the user's membership
// on OUR campaign, and — if they're an active paid member (optionally of an
// allowed tier) — issue a signed session cookie and send them to /app.
import { getCookie, signSession, setCookieHeader } from "../_auth.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(request, "oauth_state");

  if (!code || !state || state !== savedState) {
    return redirect(`${url.origin}/denied.html?e=state`);
  }

  // 1) Exchange the code for an access token
  const tokenRes = await fetch("https://www.patreon.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: env.PATREON_CLIENT_ID,
      client_secret: env.PATREON_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/callback`,
    }),
  });
  if (!tokenRes.ok) return redirect(`${url.origin}/denied.html?e=token`);
  const token = await tokenRes.json();

  // 2) Ask Patreon: who is this, and what is their membership on my campaign?
  const idUrl =
    "https://www.patreon.com/api/oauth2/v2/identity" +
    "?include=memberships" +
    "&fields%5Bmember%5D=patron_status,currently_entitled_amount_cents" +
    "&fields%5Buser%5D=full_name";
  const meRes = await fetch(idUrl, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) return redirect(`${url.origin}/denied.html?e=identity`);
  const me = await meRes.json();

  // 3) Evaluate membership
  const memberships = me.included || [];
  let active = false;
  let cents = 0;
  for (const inc of memberships) {
    if (inc.type === "member" && inc.attributes) {
      if (inc.attributes.patron_status === "active_patron") {
        active = true;
        cents = Math.max(cents, inc.attributes.currently_entitled_amount_cents || 0);
      }
    }
  }

  // Optional: require a minimum pledge (e.g. 500 = $5). Set MIN_CENTS env var, or leave 0.
  const minCents = parseInt(env.MIN_CENTS || "0", 10);
  if (!active || cents < minCents) {
    return redirect(`${url.origin}/denied.html?e=tier`);
  }

  // 4) Issue a signed session (7 days). Store only what you need.
  const userId = me.data?.id || "unknown";
  const name = me.data?.attributes?.full_name || "Member";
  const session = await signSession(
    { uid: userId, name, cents },
    env.SESSION_SECRET,
    60 * 60 * 24 * 7
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${url.origin}/app`,
      "Set-Cookie": setCookieHeader("session", session, 60 * 60 * 24 * 7),
    },
  });
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location } });
}
