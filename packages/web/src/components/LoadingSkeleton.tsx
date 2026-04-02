export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-3" role="status" aria-label="Inhalt wird geladen">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-muted rounded" style={{ width: `${85 - i * 10}%` }} />
      ))}
      <span className="sr-only">Inhalt wird geladen…</span>
    </div>
  );
}
