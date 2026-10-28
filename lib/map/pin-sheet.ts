import { haversineMeters, walkingDirectionsUrl, walkingMinutes, type LatLng } from "../geo";
import { formatRemaining, remainingMs } from "../freshness";
import { snapShopHref } from "../snap/target";

export function bookHref(slug: string): string {
  return "/book/" + encodeURIComponent(slug);
}

export type PinSheetPost = {
  id: string;
  photoUrl: string | null;
  createdAt: string;
  expiresAt: string;
  seed: boolean;
};

export type PinSheetShop = {
  id: string;
  slug: string;
  name: string;
  nameLocal?: string | null;
  lat: number;
  lng: number;
};

export type PinSheet = {
  name: string;
  nameLocal: string | null;
  walkMinutes: number;
  photoUrl: string | null;
  freshness: { kind: "none" } | { kind: "live"; label: string } | { kind: "seed" };
  goNowHref: string;
  bookHref: string;
  cameraHref: string;
  prompt: "first" | "add";
};

export function newestLivePost(posts: readonly PinSheetPost[], now: number): PinSheetPost | null {
  const live = posts.filter((post) => Date.parse(post.expiresAt) > now);
  live.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
  return live[0] ?? null;
}

export function pinSheetContent(input: {
  shop: PinSheetShop;
  posts: readonly PinSheetPost[];
  now: number;
  origin: LatLng;
}): PinSheet {
  const post = newestLivePost(input.posts, input.now);
  const meters = haversineMeters(input.origin, input.shop);
  let freshness: PinSheet["freshness"] = { kind: "none" };
  if (post?.seed) freshness = { kind: "seed" };
  else if (post) freshness = { kind: "live", label: formatRemaining(remainingMs(post.expiresAt, input.now)) };
  return {
    name: input.shop.name,
    nameLocal: input.shop.nameLocal ?? null,
    walkMinutes: walkingMinutes(meters),
    photoUrl: post?.photoUrl ?? null,
    freshness,
    goNowHref: walkingDirectionsUrl(input.shop),
    bookHref: bookHref(input.shop.slug),
    cameraHref: snapShopHref(input.shop.id, input.shop.name),
    prompt: post ? "add" : "first",
  };
}
