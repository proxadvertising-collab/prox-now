import { EmptyState } from "@/components/ui/EmptyState";
import { t } from "@/lib/copy";

export default function WalletPage() {
  return (
    <>
      <h1 className="text-title font-bold text-fg">{t("en", "nav.wallet")}</h1>
      <EmptyState
        message="No coupons yet. Snap a shop you're at."
        action={{ href: "/snap", label: t("en", "snap.cta") }}
      />
    </>
  );
}
