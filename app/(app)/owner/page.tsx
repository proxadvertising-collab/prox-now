import { connection } from "next/server";
import { OwnerDesk } from "@/components/owner/OwnerDesk";
import { ownerClient } from "@/lib/owner/http";
import { readOwnerShops, type OwnerShop } from "@/lib/owner/shops";

export const instant = false;

function isDigest(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

async function loadOwnerShops(): Promise<OwnerShop[]> {
  try {
    const { supabase, user } = await ownerClient();
    if (!supabase || !user) return [];
    const result = await supabase.rpc("owner_home");
    if (result.error) return [];
    return readOwnerShops(result.data);
  } catch (error) {
    if (isDigest(error)) throw error;
    return [];
  }
}

export default async function OwnerPage() {
  await connection();
  const shops = await loadOwnerShops();
  return <OwnerDesk initialShops={shops} />;
}
