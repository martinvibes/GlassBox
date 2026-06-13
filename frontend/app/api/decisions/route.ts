import { NextResponse } from "next/server";
import { readDecisions } from "@/lib/backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "40", 10);
  const decisions = await readDecisions(limit);
  return NextResponse.json({ decisions: decisions.reverse() }); // newest first
}
