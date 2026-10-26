import { MapView } from "@/components/map/MapView";
import { ShopList } from "@/components/map/ShopList";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { t } from "@/lib/copy";

export default function MapPage() {
  return (
    <div className="flex flex-col">
      <div className="flex h-[calc(100dvh-var(--safe-top)-var(--nav-h)-var(--safe-bottom))] flex-col overflow-hidden md:h-[calc(100dvh-var(--safe-top)-2.75rem)]">
        <DemoBanner />
        <div className="min-h-0 flex-1">
          <MapView />
        </div>
      </div>
      <section
        className="px-4 pb-[calc(var(--nav-h)+var(--safe-bottom)+1.5rem)] pt-4 md:pb-8"
        aria-labelledby="shops-near"
      >
        <h1 id="shops-near" className="text-heading font-bold text-fg">
          {t("en", "map.near")}
        </h1>
        <ShopList />
      </section>
    </div>
  );
}
