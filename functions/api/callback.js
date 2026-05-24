// GET /api/callback?code=...&state=...
// Patreon redirects here. We exchange the code, read the user's membership,
// and — if they hold an allowed tier — issue a signed session cookie.
// The whole flow is wrapped in try/catch so a bad Patreon response can never
// crash the Worker (Error 1101); instead we redirect to /denied with a reason.
import { getCookie, signSession, setCookieHeader } from "../_auth.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  try {
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
    if (!token || !token.access_token) return redirect(`${url.origin}/denied.html?e=notoken`);

    // 2) Ask Patreon: who is this, and which tiers are they entitled to?
    const idUrl =
      "https://www.patreon.com/api/oauth2/v2/identity" +
      "?include=memberships.currently_entitled_tiers" +
      "&fields%5Bmember%5D=patron_status,currently_entitled_amount_cents" +
      "&fields%5Btier%5D=title" +
      "&fields%5Buser%5D=full_name";
    const meRes = await fetch(idUrl, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) return redirect(`${url.origin}/denied.html?e=identity`);
    const me = await meRes.json();

    // 3) Evaluate membership by TIER (robust to discounts/promos/currency).
    const allowedTiers = String(env.ALLOWED_TIERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const included = Array.isArray(me && me.included) ? me.included : [];
    let active = false;
    const userTierIds = [];
    for (const inc of included) {
      if (inc && inc.type === "member" && inc.attributes) {
        if (inc.attributes.patron_status === "active_patron") active = true;
        const rel = inc.relationships && inc.relationships.currently_entitled_tiers;
        const tiers = rel && Array.isArray(rel.data) ? rel.data : [];
        for (const t of tiers) {
          if (t && t.id != null) userTierIds.push(String(t.id));
        }
      }
    }

    const hasAllowedTier =
      allowedTiers.length === 0
        ? active
        : active && userTierIds.some((id) => allowedTiers.includes(id));

    if (!hasAllowedTier) {
      return redirect(`${url.origin}/denied.html?e=tier`);
    }

    // 4) Issue a signed session (7 days).
    const userId = (me && me.data && me.data.id) || "unknown";
    const name =
      (me && me.data && me.data.attributes && me.data.attributes.full_name) || "Member";
    const session = await signSession(
      { uid: userId, name, tiers: userTierIds },
      env.SESSION_SECRET,
      60 * 60 * 24 * 7
    );

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${url.origin}/tools/spur-gear`,
        "Set-Cookie": setCookieHeader("session", session, 60 * 60 * 24 * 7),
      },
    });
  } catch (err) {
    // Never crash. Surface reason + first stack line so we can pinpoint the source.
    const base = String((err && err.message) || err);
    const stack = String((err && err.stack) || "").split("\n")[1] || "";
    const msg = encodeURIComponent((base + " @ " + stack).slice(0, 200));
    return redirect(`${url.origin}/denied.html?e=exception&m=${msg}`);
  }
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location } });
}
