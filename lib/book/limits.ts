/**
 * Verified live: one Meta request accepts many input_image parts (tried 1 through 64).
 * Eight images is the book cap per call. Larger menus chunk, and a truncated reply halves.
 */
export const MAX_IMAGES_PER_CALL = 8;

export const MAX_UPLOAD_IMAGES = 8;

export const MAX_MENU_PAGES = 12;

export const MAX_STORED_BYTES = 1_048_576;

export const STORED_LONG_EDGE = 1600;

export const META_LONG_EDGE = 1600;

export const META_JPEG_QUALITY = 80;

export const MAX_ITEMS_PER_PAGE = 150;

export const TAGLINE_MAX = 80;

export const EXTRACTED_JSON_BUDGET = 12_000;

export const UPLOAD_KINDS = ["storefront", "logo", "hours", "menu", "extra"] as const;

export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const SINGLE_PAGE_KINDS = ["storefront", "logo", "hours", "qr"] as const;

export const FOOD_CATEGORIES = ["street_food", "drinks", "restaurant", "fruit"] as const;

export function isUploadKind(value: string): value is UploadKind {
  return (UPLOAD_KINDS as readonly string[]).includes(value);
}
