export function RefreshControl({
  updatedAt,
  refreshing,
  reload,
}: {
  updatedAt?: number;
  refreshing: boolean;
  reload: () => void;
}) {
  return (
    <div className="refresh-control">
      <span aria-live="polite">
        {refreshing
          ? "Updating…"
          : updatedAt
            ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-GB")}`
            : "Waiting for data"}
      </span>
      <button onClick={reload} disabled={refreshing}>
        ↻ Refresh
      </button>
    </div>
  );
}
