export function ShopPicker({
  shops,
  newLabel,
  onPick,
  onNew,
}: {
  shops: readonly { id: string; name: string; distanceM: number }[];
  newLabel: string;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="seed-picker">
      {shops.map((shop) => (
        <button key={shop.id} type="button" onClick={() => onPick(shop.id)}>
          {shop.name} · {Math.round(shop.distanceM)} m
        </button>
      ))}
      <button type="button" onClick={onNew}>
        {newLabel}
      </button>
    </div>
  );
}
