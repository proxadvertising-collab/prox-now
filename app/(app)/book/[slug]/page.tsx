import { connection } from "next/server";
import { t } from "@/lib/copy";
import { bookBuildHref } from "@/lib/book/builder";
import { presentBook } from "@/lib/book/present";
import { hasShopEnv } from "@/lib/shops/source";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function shopByKey(key: string): Promise<{ id: string; slug: string; name: string } | null> {
  const supabase = await createClient();
  const query = supabase.from("shops").select("id, slug, name");
  const result = UUID.test(key) ? await query.eq("id", key).maybeSingle() : await query.eq("slug", key).maybeSingle();
  const row = result.data;
  if (!row || typeof row.id !== "string" || typeof row.slug !== "string" || typeof row.name !== "string") return null;
  return { id: row.id, slug: row.slug, name: row.name };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const key = decodeURIComponent(slug);
  if (!hasShopEnv()) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-bold text-fg">{t("en", "sheet.openBook")}</h1>
        <p className="text-body text-fg">{t("en", "book.empty")}</p>
        <a
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline"
          href={bookBuildHref(key)}
        >
          {t("en", "book.build")}
        </a>
      </div>
    );
  }

  try {
    const supabase = await createClient();
    const shop = await shopByKey(key);
    const lookup = shop?.slug ?? (UUID.test(key) ? null : key);
    const result = lookup ? await supabase.rpc("book_public", { p_slug: lookup }) : { data: null };
    const view = presentBook(result.data, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const name = view?.name ?? shop?.name ?? key;
    const build = bookBuildHref(view?.slug ?? shop?.slug ?? key);

    if (!view || view.pages.length === 0) {
      return (
        <div className="flex flex-col gap-3">
          <h1 className="text-title font-bold text-fg">{name}</h1>
          <p className="text-body text-fg">{t("en", "book.empty")}</p>
          <a
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline"
            href={build}
          >
            {t("en", "book.build")}
          </a>
        </div>
      );
    }

    const menu = view.pages.filter((page) => page.kind === "menu" || page.kind === "storefront" || page.kind === "hours");
    const shown = menu.length > 0 ? menu : view.pages;

    return (
      <div className="flex flex-col gap-4" style={view.swatches[0] ? { borderTop: "4px solid " + view.swatches[0] } : undefined}>
        {view.swatches.length > 0 ? (
          <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
            {view.swatches.map((color) => (
              <span key={color} className="h-3 flex-1" style={{ background: color }} />
            ))}
          </div>
        ) : null}
        <h1 className="text-title font-bold text-fg">{view.name}</h1>
        {view.nameLocal ? <p className="text-label text-fg-muted">{view.nameLocal}</p> : null}
        {view.tagline ? <p className="text-body text-fg">{view.tagline}</p> : null}
        {view.hoursLabel ? (
          <p className="text-body text-fg">
            {t("en", "book.hours")}: {view.hoursLabel}
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {shown.map((page) => (
            <li key={page.id}>
              {page.imageUrl ? (
                <img src={page.imageUrl} alt={view.name} className="aspect-[4/3] w-full rounded-lg object-cover" />
              ) : (
                <div className="aspect-[4/3] w-full rounded-lg bg-surface-2" />
              )}
              {page.credit ? <p className="mt-1 text-label text-fg-muted">{t("en", "book.credit", { name: page.credit })}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  } catch {
    return <p className="text-body text-fg">{t("en", "book.empty")}</p>;
  }
}
