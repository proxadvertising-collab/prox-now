import type { LivePost } from "../posts/source";

export const SHEET_SWIPE_PX = 80;
export const SHEET_FLICK_PX = 28;
export const SHEET_FLICK_PX_PER_MS = 0.6;
export const SHEET_PHOTO_CAP = 10;

export function sheetSwipeCloses(input: {
  deltaY: number;
  elapsedMs: number;
  scrolling: boolean;
}): boolean {
  if (input.scrolling) return false;
  if (input.deltaY >= SHEET_SWIPE_PX) return true;
  if (input.deltaY >= SHEET_FLICK_PX && input.elapsedMs > 0 && input.deltaY / input.elapsedMs >= SHEET_FLICK_PX_PER_MS) {
    return true;
  }
  return false;
}

export function sheetCloseUsesHistory(fromPop: boolean, historyPushed: boolean): boolean {
  return !fromPop && historyPushed;
}

export function sheetPhotos(posts: readonly LivePost[], shopId: string, now: number): LivePost[] {
  return posts
    .filter((post) => post.shopId === shopId && Date.parse(post.expiresAt) > now)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, SHEET_PHOTO_CAP);
}

export function clampPhotoIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(index) || index < 0) return 0;
  if (index >= count) return count - 1;
  return Math.floor(index);
}

export function photoCounter(index: number, count: number): string {
  return String(clampPhotoIndex(index, count) + 1) + " / " + String(Math.max(count, 0));
}
