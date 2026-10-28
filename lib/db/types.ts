export type ShopCategory =
  | "street_food"
  | "drinks"
  | "restaurant"
  | "fruit"
  | "laundry"
  | "home_services"
  | "barber"
  | "other";

export type PostStatus = "live" | "kept" | "passed";

export type CouponStatus = "active" | "used" | "expired";

export type ShopOwnerStatus = "pending" | "verified" | "rejected";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  locale: string;
  created_at: string;
};

export type Shop = {
  id: string;
  slug: string;
  name: string;
  name_local: string | null;
  category: ShopCategory;
  lat: number;
  lng: number;
  country_code: string;
  timezone: string;
  currency: string;
  address_hint: string | null;
  phone_public: string | null;
  is_demo: boolean;
  claimed: boolean;
  created_at: string;
  created_by: string | null;
  source: "seed" | "user";
};

/** Claim codes are not on this row. They live in shop_claim_codes, which clients cannot read. */
export type ShopOwner = {
  shop_id: string;
  user_id: string;
  status: ShopOwnerStatus;
  created_at: string;
};

export type Post = {
  id: string;
  shop_id: string;
  author_id: string;
  photo_path: string | null;
  text_original: string | null;
  text_translated: Record<string, string>;
  status: PostStatus;
  is_demo: boolean;
  is_seed: boolean;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

export type Coupon = {
  id: string;
  holder_id: string;
  shop_id: string;
  post_id: string | null;
  day: string;
  code: string;
  status: CouponStatus;
  used_at: string | null;
  expires_at: string;
  created_at: string;
};

export type ShopBookStatus = "live" | "hidden";

export type BookPageKind = "storefront" | "logo" | "hours" | "menu" | "qr" | "other";

export type BookPageStatus = "live" | "removed";

/** Mirrors shop_books. Clients cannot write this table. */
export type ShopBook = {
  shop_id: string;
  status: ShopBookStatus;
  tagline: string | null;
  theme: Record<string, unknown>;
  hours: Record<string, unknown>;
  source_language: string | null;
  built_by_model: string | null;
  created_at: string;
  updated_at: string;
};

/** Mirrors shop_book_pages. image_path is the blurred JPEG, never the original. */
export type ShopBookPage = {
  id: string;
  shop_id: string;
  kind: BookPageKind;
  position: number;
  image_path: string;
  width: number | null;
  height: number | null;
  status: BookPageStatus;
  contributed_by: string | null;
  batch_id: string | null;
  language: string | null;
  extracted: Record<string, unknown>;
  ai_meta: Record<string, unknown>;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
};

/** Mirrors shop_book_translations. Prices inside extracted are copied, not translated. */
export type ShopBookTranslation = {
  page_id: string;
  lang: string;
  extracted: Record<string, unknown>;
  source_hash: string;
  model: string | null;
  created_at: string;
};
