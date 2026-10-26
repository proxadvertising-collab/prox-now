import { EmptyState } from "@/components/ui/EmptyState";
import { t } from "@/lib/copy";

export default function InboxPage() {
  return (
    <>
      <h1 className="text-title font-bold text-fg">{t("en", "nav.shop")}</h1>
      <EmptyState message="All caught up. New photos land here after 2 hours." />
    </>
  );
}
