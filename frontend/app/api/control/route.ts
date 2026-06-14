import { NextResponse } from "next/server";
import { readControl, writeControl } from "@/lib/backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(await readControl());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const paused = !!body.paused;
  await writeControl({ paused });
  return NextResponse.json({ ok: true, paused });
}
