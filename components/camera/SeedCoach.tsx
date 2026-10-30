export function SeedCoach({
  seen,
  labels,
  toast,
  deleteLabel,
  shots,
  doneLabel,
  canDone,
  onDelete,
  onDone,
}: {
  seen: { sign: boolean; menu: boolean; deals: boolean; hours: boolean };
  labels: { sign: string; menu: string; deals: string; hours: string };
  toast: { text: string; duplicateOf: number | null; shotId: string } | null;
  deleteLabel: string;
  shots: readonly { id: string; url: string }[];
  doneLabel: string;
  canDone: boolean;
  onDelete: (id: string) => void;
  onDone: () => void;
}) {
  const chips = [
    { key: "sign", label: labels.sign, on: seen.sign },
    { key: "menu", label: labels.menu, on: seen.menu },
    { key: "deals", label: labels.deals, on: seen.deals },
    { key: "hours", label: labels.hours, on: seen.hours },
  ];
  return (
    <>
      <div className="seed-chips">
        {chips.map((chip) => (
          <span key={chip.key} className="seed-chip" data-seen={chip.on ? "true" : "false"}>
            {chip.on ? "✓ " : ""}
            {chip.label}
          </span>
        ))}
      </div>
      {toast ? (
        <div className="seed-toast">
          <p>{toast.text}</p>
          {toast.duplicateOf !== null ? (
            <button type="button" onClick={() => onDelete(toast.shotId)}>
              {deleteLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="seed-film">
        {shots.map((shot) => (
          <button key={shot.id} type="button" onClick={() => onDelete(shot.id)}>
            <img className="seed-thumb" src={shot.url} alt="" />
          </button>
        ))}
      </div>
      <button type="button" className="seed-done" disabled={!canDone} onClick={onDone}>
        {doneLabel}
      </button>
    </>
  );
}
