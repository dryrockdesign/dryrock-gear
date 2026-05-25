// POST /api/export-stl   body: JSON params
// Only authenticated members get a real STL back. The geometry code never
// reaches the browser, so copying the page is useless.
import { getCookie, verifySession } from "../_auth.js";
import { makeSTL, clampParams } from "../../lib/gear-server.js";
import { makeHelicalSTL, clampHelical } from "../../lib/helical-server.js";

export async function onRequestPost({ request, env }) {
  // 1) gate: must be a verified member
  const session = await verifySession(getCookie(request, "session"), env.SESSION_SECRET);
  if (!session) return new Response("Unauthorized", { status: 401 });

  // 2) optional: only accept calls coming from our own pages (anti-hotlink)
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGIN || new URL(request.url).origin);
  if (origin && origin !== allowed) return new Response("Forbidden", { status: 403 });

  // 3) read + clamp params
  let raw; try { raw = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const kind = raw.kind === "helical" ? "helical" : "spur";
  const which = raw.which === "gear" ? "gear" : "pinion";

  let stl, name;
  if (kind === "helical") {
    const p = clampHelical(raw);
    const teeth = which === "gear" && p.mode === "pair" ? p.teeth2 : p.teeth;
    const x = which === "gear" && p.mode === "pair" ? p.x2 : p.x1;
    stl = makeHelicalSTL(p, teeth, x);
    name = `dryrock_helical_${which}_mn${p.module}_z${teeth}_b${p.beta}.stl`;
  } else {
    const p = clampParams(raw);
    const teeth = which === "gear" && p.mode === "pair" ? p.teeth2 : p.teeth;
    const x = which === "gear" && p.mode === "pair" ? p.x2 : p.x1;
    stl = makeSTL(p, teeth, x);
    name = `dryrock_${which}_m${p.module}_z${teeth}.stl`;
  }

  return new Response(stl, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
