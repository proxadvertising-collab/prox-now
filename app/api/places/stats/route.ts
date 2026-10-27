import { connection, NextResponse } from "next/server";
import { getPlaceStats } from "../../../../lib/places/stats";

export async function GET() {
  await connection();
  const stats = await getPlaceStats();
  return NextResponse.json(stats, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}
