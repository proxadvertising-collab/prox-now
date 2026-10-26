import { EmptyState } from "@/components/ui/EmptyState";
import { t } from "@/lib/copy";

export default function MePage() {
  return (
    <>
      <h1 className="text-title font-bold text-fg">{t("en", "nav.you")}</h1>
      <EmptyState message={t("en", "demo.try")} />
    </>
  );
}
