import type { CopyKey } from "../copy";

export function livePostErrorKey(code: string): CopyKey | null {
  if (code === "shop_full") return "post.shopFull";
  if (code === "already_live") return "post.already";
  return null;
}
