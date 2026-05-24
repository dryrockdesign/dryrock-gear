// Guards EVERYTHING under /tools/*. No valid session → redirect to Patreon login.
// Every current and future tool is automatically protected by this one bouncer.
import { getCookie, verifySession } from "../_auth.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const session = await verifySession(getCookie(request, "session"), env.SESSION_SECRET);
  if (!session) {
    return new Response(null, { status: 302, headers: { Location: `${url.origin}/api/login` } });
  }
  return next();
}
