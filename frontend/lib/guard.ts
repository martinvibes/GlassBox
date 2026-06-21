import { NextResponse } from "next/server";

/**
 * Gate for state-mutating control endpoints (pause, flatten, manual command, mandate).
 *
 * If GLASSBOX_CONTROL_SECRET is set (a public LIVE deployment), every write must carry
 * the matching key — via the `x-glassbox-key` header or a `?key=` query param — so a
 * stranger who finds the URL can't pause or flatten the real wallet. If the env var is
 * unset (local dev / paper demo), writes are open and behaviour is unchanged.
 *
 * Returns a 401 NextResponse to short-circuit on failure, or null to proceed.
 */
export function denyIfUnauthorized(req: Request): NextResponse | null {
  const secret = process.env.GLASSBOX_CONTROL_SECRET;
  if (!secret) return null; // open in local/paper mode
  const provided =
    req.headers.get("x-glassbox-key") ||
    new URL(req.url).searchParams.get("key") ||
    "";
  if (provided.length === secret.length && provided === secret) return null;
  return NextResponse.json(
    { ok: false, error: "unauthorized — operator key required for control actions" },
    { status: 401 },
  );
}
