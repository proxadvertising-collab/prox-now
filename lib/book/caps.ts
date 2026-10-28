import { isUploadKind, MAX_MENU_PAGES, MAX_UPLOAD_IMAGES, type UploadKind } from "./limits";

export type CapCode = "bad_kind" | "bad_image" | "page_limit" | "already_there";

const SINGLE = new Set(["storefront", "logo", "hours", "qr"]);

export function uploadBlock(input: {
  kind: string;
  fileCount: number;
  livePages: readonly { kind: string; status: string }[];
}): CapCode | null {
  if (!isUploadKind(input.kind)) return "bad_kind";
  if (input.fileCount < 1 || input.fileCount > MAX_UPLOAD_IMAGES) return "bad_image";
  const live = input.livePages.filter((page) => page.status === "live");
  if (SINGLE.has(input.kind) && input.fileCount > 1) return "bad_image";
  if (SINGLE.has(input.kind) && live.some((page) => page.kind === input.kind)) return "already_there";
  if (input.kind === "menu") {
    const menus = live.filter((page) => page.kind === "menu").length;
    if (menus + input.fileCount > MAX_MENU_PAGES) return "page_limit";
  }
  return null;
}

export function capStatus(code: CapCode): number {
  if (code === "bad_kind" || code === "bad_image") return 400;
  return 409;
}

export function isSingleKind(kind: UploadKind): boolean {
  return SINGLE.has(kind);
}
