// Guards the /app/* route. No valid session → redirect to Patreon login.
import { getCookie, verifySession } from "../_auth.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const session = await verifySession(getCookie(request, "session"), env.SESSION_SECRET);
  if (!session) {
    return new Response(null, { status: 302, headers: { Location: `${url.origin}/api/login` } });
  }
  return next();   // valid member → serve /app/index.html (the static tool)
}
