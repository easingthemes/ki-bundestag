import { type Bill, type BillImpact } from "../../api";
import { SEMANTIC_HEX } from "@/lib/colors";

const IMPACT_FIELDS: { key: keyof BillImpact; label: string }[] = [
  { key: "budget", label: "Haushalt" },
  { key: "unemployment", label: "Arbeitslosigkeit" },
  { key: "inflation", label: "Inflation" },
  { key: "gdpGrowth", label: "BIP-Wachstum" },
  { key: "publicSentiment", label: "Öffentliche Stimmung" },
];

function fmtImpact(val: number | undefined): string {
  if (val == null) return "—";
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}`;
}

function fmtDelta(orig: number | undefined, cur: number | undefined) {
  if (orig == null || cur == null) return fmtImpact(cur);
  if (orig === cur) return fmtImpact(cur);
  const delta = cur - orig;
  const deltaStr = delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
  const color = delta > 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative;
  return (
    <span>
      <span style={{ color: SEMANTIC_HEX.neutral, textDecoration: "line-through" }}>{fmtImpact(orig)}</span>
      {" → "}
      <span>{fmtImpact(cur)}</span>
      <span style={{ fontSize: "0.75rem", color, marginLeft: 4 }}>({deltaStr})</span>
    </span>
  );
}

interface BillImpactDisplayProps {
  bill: Bill;
}

export function BillImpactDisplay({ bill }: BillImpactDisplayProps) {
  const hasImpact = IMPACT_FIELDS.some(f => bill.impact[f.key] != null);
  const hasOriginalDiff = bill.originalImpact != null &&
    IMPACT_FIELDS.some(f => bill.originalImpact![f.key] !== bill.impact[f.key]);

  if (!hasImpact) return null;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "2px solid #ddd", color: "#666", fontWeight: 600 }}>
            Indikator
          </th>
          <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: "2px solid #ddd", color: "#666", fontWeight: 600 }}>
            {hasOriginalDiff ? "Original → Endwert" : "Auswirkung"}
          </th>
        </tr>
      </thead>
      <tbody>
        {IMPACT_FIELDS
          .filter(f => bill.impact[f.key] != null || (bill.originalImpact && bill.originalImpact[f.key] != null))
          .map(f => (
            <tr key={f.key}>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", color: "#444" }}>{f.label}</td>
              <td style={{ padding: "6px 8px", borderBottom: "1px solid #eee", textAlign: "right", fontFamily: "monospace" }}>
                {hasOriginalDiff
                  ? fmtDelta(bill.originalImpact?.[f.key], bill.impact[f.key])
                  : fmtImpact(bill.impact[f.key])
                }
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
