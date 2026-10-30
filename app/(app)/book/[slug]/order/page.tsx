import { connection } from "next/server";
import { OrderClient } from "@/components/order/OrderUi";
import { bookText, displayName } from "@/lib/book/display";
import { bookSurface } from "@/lib/book/cutouts";
import { presentBook } from "@/lib/book/present";
import { t } from "@/lib/copy";
import { hasShopEnv } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function OrderPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug: raw } = await params;
  const key = decodeURIComponent(raw);
  if (!hasShopEnv()) return <p className="text-body text-fg">{t("en", "book.empty")}</p>;
  const supabase = await createClient();
  const query = supabase.from("shops").select("id, slug, name");
  const result = UUID.test(key) ? await query.eq("id", key).maybeSingle() : await query.eq("slug", key).maybeSingle();
  const shop = result.data;
  const slug = shop && typeof shop.slug === "string" ? shop.slug : key;
  const lookup = shop && typeof shop.slug === "string" ? shop.slug : UUID.test(key) ? null : key;
  const book = lookup ? await supabase.rpc("book_public", { p_slug: lookup }) : { data: null };
  const view = presentBook(book.data, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const surface = view ? bookSurface(view) : null;
  const shopName = displayName(view?.name ?? (shop && typeof shop.name === "string" ? shop.name : key));
  return (
    <OrderClient
      slug={view?.slug ?? slug}
      shopName={shopName}
      logoUrl={surface?.logoUrl ?? null}
      address={bookText(view?.info.address?.value ?? null)}
      menuLanguage={view?.sourceLanguage || "th"}
    />
  );
}
