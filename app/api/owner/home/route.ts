import { NextResponse } from "next/server";
import { ownerClient, ownerFailure, unsigned } from "../../../../lib/owner/http";

export async function GET() {
  const { supabase, user } = await ownerClient();
  if (!supabase || !user) return unsigned();
  const result = await supabase.rpc("owner_home");
  if (result.error) return ownerFailure(result.error);
  const shops = Array.isArray(result.data) ? result.data : [];
  return NextResponse.json({ shops });
}
