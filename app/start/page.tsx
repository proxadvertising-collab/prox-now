import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { openingDest, serverSignedIn } from "../login/gate";

function isDigest(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

async function readSignedIn(): Promise<boolean> {
  const jar = await cookies();
  const keep = jar.get("prox-keep")?.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return serverSignedIn(false, keep);
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return serverSignedIn(Boolean(data.user), keep);
  } catch (error) {
    if (isDigest(error)) throw error;
    return false;
  }
}

export const instant = false;

export default async function Start() {
  await connection();
  redirect(openingDest(await readSignedIn()));
}
