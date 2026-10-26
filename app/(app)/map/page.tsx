import { CountdownRing } from "@/components/ui/CountdownRing";
import { EmptyState } from "@/components/ui/EmptyState";
import { t } from "@/lib/copy";

export default function MapPage() {
  return (
    <>
      <h1 className="text-title font-bold text-fg">{t("en", "nav.map")}</h1>
      <div className="mt-8 flex justify-center">
        <CountdownRing remainingMs={4_320_000} size={168} />
      </div>
      <EmptyState
        message={t("en", "empty.map")}
        action={{ href: "/snap", label: t("en", "snap.cta") }}
      />
    </>
  );
}
