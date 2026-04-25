import { useState } from "react";
import { type Party } from "../../api";
import { fixColor } from "@/lib/utils";
import { SEMANTIC_HEX } from "@/lib/colors";
import { Card, CardContent } from "@/components/ui/card";
import { BUNDESTAG_SIZE, MAJORITY_SEATS } from "@/lib/parliament";

function ideologicalSpread(selected: Party[]): number | null {
  if (selected.length < 2) return null;
  let total = 0, pairs = 0;
  const keys = ["economy", "social", "environment", "immigration", "spending"] as const;
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const dist = keys.reduce((s, k) =>
        s + Math.abs(((selected[i].policyPriorities as Record<string, number>)[k] ?? 0) - ((selected[j].policyPriorities as Record<string, number>)[k] ?? 0)), 0);
      total += dist; pairs++;
    }
  }
  return Math.round((total / pairs) * 10) / 10;
}

interface CoalitionCalculatorProps {
  parties: Party[];
  currentCoalitionIds: string[];
}

export function CoalitionCalculator({ parties, currentCoalitionIds }: CoalitionCalculatorProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentCoalitionIds));

  const seatedParties = [...parties].filter(p => p.seatCount > 0).sort((a, b) => b.seatCount - a.seatCount);
  const totalSeats = seatedParties.reduce((s, p) => s + p.seatCount, 0) || BUNDESTAG_SIZE;
  const selectedParties = seatedParties.filter(p => selected.has(p.id));
  const selectedSeats = selectedParties.reduce((s, p) => s + p.seatCount, 0);
  const hasMajority = selectedSeats >= MAJORITY_SEATS;
  const spread = ideologicalSpread(selectedParties);
  const spreadLabel = spread == null ? null : spread <= 1.0 ? "Kompatibel" : spread <= 2.0 ? "Moderat" : "Fragmentiert";
  const spreadColor = spread == null ? SEMANTIC_HEX.neutral : spread <= 1.0 ? SEMANTIC_HEX.positive : spread <= 2.0 ? SEMANTIC_HEX.warning : SEMANTIC_HEX.negative;

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="mb-8">
      <h2 className="section-title">Koalitionsrechner</h2>
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-1.5">
            {seatedParties.map(p => {
              const color = fixColor(p.color);
              const isSelected = selected.has(p.id);
              const barWidth = (p.seatCount / totalSeats) * 100;
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-2.5 cursor-pointer px-2 py-1.5 rounded"
                  style={{
                    background: isSelected ? `${color}18` : "transparent",
                    border: `1px solid ${isSelected ? color : "var(--color-border)"}`,
                    opacity: isSelected ? 1 : 0.55,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(p.id)}
                    className="cursor-pointer size-3.5"
                    aria-label={`${p.name} — ${p.seatCount} Sitze`}
                  />
                  <span className="size-2.5 rounded-full shrink-0" aria-hidden="true" style={{ backgroundColor: color }} />
                  <span className="font-semibold text-sm min-w-20">{p.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums min-w-16">{p.seatCount} Sitze</span>
                  <div className="flex-1 bg-muted rounded h-2.5 max-w-48" aria-hidden="true">
                    <div className="h-full rounded" style={{ width: `${barWidth}%`, backgroundColor: color }} />
                  </div>
                </label>
              );
            })}
          </div>
          <div className="mt-3.5 pt-3 border-t border-border flex gap-5 flex-wrap items-center" role="status" aria-live="polite">
            <div className="font-bold text-sm">
              <span style={{ color: hasMajority ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                {selectedSeats} / {totalSeats} Sitze
              </span>
              <span className="ml-2.5 text-sm font-extrabold" style={{ color: hasMajority ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                {hasMajority ? "MEHRHEIT" : "MINDERHEIT"}
              </span>
            </div>
            {spread != null && (
              <div className="text-sm">
                <span className="text-muted-foreground">Ideologische Distanz: </span>
                <span className="font-bold" style={{ color: spreadColor }}>{spread} — {spreadLabel}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
