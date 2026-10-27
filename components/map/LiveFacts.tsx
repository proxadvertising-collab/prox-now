"use client";

import { t, type CopyKey } from "@/lib/copy";
import { chooseCaption, formatItemPrice, languageName } from "@/lib/i18n/viewer";
import type { LivePost } from "@/lib/posts/source";

const chip =
  "inline-flex min-h-11 items-center rounded-full bg-surface-2 px-3 text-label font-semibold text-fg";

export function LiveFacts({ post, lang }: { post: LivePost; lang: "en" | "th" }) {
  const facts = post.facts;
  if (!facts) return null;
  const caption = chooseCaption(facts.captions, lang, post.textOriginal);
  const from = languageName(facts.signLanguage, lang);
  const locale = lang === "th" ? "th-TH" : "en";
  const items = facts.items.slice(0, 3);
  const showOpen = facts.openStatus === "open" || facts.openStatus === "closed";

  return (
    <div className="mt-2 flex flex-col gap-2">
      {caption ? <p className="text-body text-fg">{caption}</p> : null}
      {from ? <p className="text-label text-fg-muted">{t(lang, "facts.from", { lang: from })}</p> : null}
      {items.length > 0 || facts.crowd || showOpen || facts.signals.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item.name} className={chip}>
              {formatItemPrice(item.name, item.price, item.currency, locale)}
            </span>
          ))}
          {facts.crowd ? (
            <span className={chip}>{t(lang, ("facts.crowd." + facts.crowd) as CopyKey)}</span>
          ) : null}
          {showOpen ? (
            <span className={chip}>{t(lang, ("facts.open." + facts.openStatus) as CopyKey)}</span>
          ) : null}
          {facts.signals.map((signal) => (
            <span key={signal} className={chip}>
              {t(lang, ("facts.signal." + signal) as CopyKey)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
