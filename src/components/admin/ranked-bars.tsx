type Item = { name: string; value: number; label: string; sub?: string };

/** Ranking com barras de progresso (leve e legível no celular). */
export function RankedBars({ items, color = "var(--c1)", empty = "Sem dados no período." }: { items: Item[]; color?: string; empty?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="space-y-4">
      {items.map((i, n) => (
        <li key={`${i.name}-${n}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-semibold text-ink"><span className="mr-2 text-muted">{n + 1}.</span>{i.name}</span>
            <span className="shrink-0 text-sm font-bold text-ink">{i.label}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${Math.max((i.value / max) * 100, i.value > 0 ? 3 : 0)}%`, background: color }} />
          </div>
          {i.sub && <p className="mt-1 text-xs text-muted">{i.sub}</p>}
        </li>
      ))}
    </ol>
  );
}
