// GET /api/logout → clears the session cookie.
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${url.origin}/`,
      "Set-Cookie": "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}
