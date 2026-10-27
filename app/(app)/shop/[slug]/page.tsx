import { connection } from "next/server";

export const instant = false;
import { KeptShare } from "@/components/shop/KeptShare";
import { t } from "@/lib/copy";
import { photoPublicUrl } from "@/lib/posts/source";
import { usualItems, type UsualFact } from "@/lib/shop/usual";
import { hasShopEnv } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/server";

type Kept = {
  id: string;
  photoPath: string | null;
  author: string;
  facts: UsualFact & { crowd?: string | null } | null;
};

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  if (!hasShopEnv()) {
    return <h1 className="text-title font-bold text-fg">{slug}</h1>;
  }
  try {
    const supabase = await createClient();
    const result = await supabase.rpc("shop_public", { p_slug: slug });
    const shop = result.data as {
      id?: string;
      name?: string;
      nameLocal?: string | null;
      kept?: Kept[];
      live?: { id?: string } | null;
    } | null;
    if (!shop?.name || !shop.id) {
      return <h1 className="text-title font-bold text-fg">{t("en", "loop.missing")}</h1>;
    }
    const factsQuery = await supabase
      .from("place_facts")
      .select("facts")
      .eq("shop_id", shop.id)
      .order("observed_at", { ascending: false })
      .limit(20);
    const usual = usualItems(
      ((factsQuery.data ?? []) as { facts?: UsualFact }[]).map((row) => row.facts ?? { items: [] }),
    );
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-title font-bold text-fg">{shop.name}</h1>
        {shop.nameLocal ? <p className="text-label text-fg-muted">{shop.nameLocal}</p> : null}
        {shop.live?.id ? <p className="text-body text-fg">{t("en", "loop.live")}</p> : null}
        {usual ? <p className="text-body text-fg">{t("en", "loop.usually", { items: usual })}</p> : null}
        <ul className="flex flex-col gap-4">
          {(shop.kept ?? []).map((photo) => {
            const url = photoPublicUrl(base, photo.photoPath);
            if (!url) return null;
            return (
              <li key={photo.id} className="flex flex-col gap-2">
                <img src={url} alt={shop.name} className="aspect-[4/3] w-full rounded-lg object-cover" />
                <p className="text-body text-fg">{t("en", "loop.by", { name: photo.author })}</p>
                <KeptShare url={url} shop={shop.name ?? ""} author={photo.author} facts={photo.facts} />
              </li>
            );
          })}
        </ul>
      </div>
    );
  } catch {
    return <h1 className="text-title font-bold text-fg">{t("en", "loop.missing")}</h1>;
  }
}
