import { EmptyState } from "@/components/ui/EmptyState";
import { t } from "@/lib/copy";

export default function SnapPage() {
  return (
    <>
      <h1 className="text-title font-bold text-fg">{t("en", "nav.snap")}</h1>
      <EmptyState message={t("en", "loc.why")} />
    </>
  );
}
