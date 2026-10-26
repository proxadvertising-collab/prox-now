import { t } from "@/lib/copy";

export function DemoBanner() {
  return (
    <p role="status" className="bg-info-soft px-4 py-3 text-label text-info">
      {t("en", "demo.banner")}
    </p>
  );
}
