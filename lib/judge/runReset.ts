import { ownerError } from "../owner/http";
import { createServiceClient } from "../supabase/admin";

type ResetClient = {
  // The Supabase rpc builder is thenable. It is not a Promise.
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export type DemoReset =
  | { ok: true }
  | { ok: false; error: string; status: number };

/** Runs reset_demo and deletes the post-photos paths it returns. */
export async function runReset(supabase: ResetClient): Promise<DemoReset> {
  const reset = await supabase.rpc("reset_demo");
  if (reset.error) {
    const mapped = ownerError(String(reset.error.message ?? ""));
    return { ok: false, error: mapped.error, status: mapped.status };
  }
  const paths = Array.isArray(reset.data)
    ? reset.data.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  if (paths.length === 0) return { ok: true };
  let service;
  try {
    service = createServiceClient();
  } catch {
    return { ok: false, error: "demo_not_ready", status: 503 };
  }
  const removed = await service.storage.from("post-photos").remove(paths);
  if (removed.error) return { ok: false, error: "photo_cleanup_failed", status: 502 };
  return { ok: true };
}
