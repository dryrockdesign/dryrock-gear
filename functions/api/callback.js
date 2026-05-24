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

  // 2) Ask Patreon: who is this, and which tiers are they entitled to on my campaign?
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

  // 3) Evaluate membership by TIER, not by dollar amount.
  //    This is robust to discounts, promos, annual plans and currency differences:
  //    a member keeps their tier even if they paid a reduced price.
  //
  //    ALLOWED_TIERS = comma-separated Patreon tier IDs that unlock the tools.
  //    Set it as an environment variable in Cloudflare. Current tiers:
  //      25753996 = All Designs + Engineering Tools ($9.90)
  //      25754073 = Commercial License ($19.90)
  //    To add a future tier, just append its ID to the ALLOWED_TIERS variable.
  const allowedTiers = (env.ALLOWED_TIERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Collect this user's active tier IDs from the included data.
  const included = me.included || [];
  let active = false;
  const userTierIds = [];
  for (const inc of included) {
    if (inc.type === "member" && inc.attributes) {
      if (inc.attributes.patron_status === "active_patron") active = true;
      const tiers = inc.relationships?.currently_entitled_tiers?.data || [];
      for (const t of tiers) userTierIds.push(String(t.id));
    }
  }

  // Access is granted only if the member is active AND holds an allowed tier.
  // If ALLOWED_TIERS is empty (not configured), fall back to "any active patron"
  // so the site never accidentally locks everyone out during setup.
  const hasAllowedTier =
    allowedTiers.length === 0
      ? active
      : active && userTierIds.some((id) => allowedTiers.includes(id));

  if (!hasAllowedTier) {
    return redirect(`${url.origin}/denied.html?e=tier`);
  }

  // 4) Issue a signed session (7 days). Store only what you need.
  const userId = me.data?.id || "unknown";
  const name = me.data?.attributes?.full_name || "Member";
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
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location } });
}
