// GET /api/login  → sends the user to Patreon's consent screen.
import { randomState, setCookieHeader } from "../_auth.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/callback`;
  const state = randomState();

  const authUrl = new URL("https://www.patreon.com/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", env.PATREON_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  // identity = who they are; identity.memberships = their membership/tier on YOUR campaign
  authUrl.searchParams.set("scope", "identity identity.memberships");
  authUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      // remember state for 10 min to verify on callback (CSRF guard)
      "Set-Cookie": setCookieHeader("oauth_state", state, 600),
    },
  });
}
