import { useMemo } from "react";

interface SeatGroup {
  partyId: string;
  count: number;
  color: string;
  name: string;
}

interface HemicycleProps {
  seats: SeatGroup[];
  totalSeats?: number;
  size?: "sm" | "md" | "lg";
  showLegend?: boolean;
  className?: string;
}

/** Political spectrum order: left → right */
const SPECTRUM_ORDER = ["linke", "gruene", "spd", "fdp", "cdu", "afd"];

function spectrumIndex(partyId: string): number {
  const idx = SPECTRUM_ORDER.indexOf(partyId);
  return idx >= 0 ? idx : 99;
}

function fixColor(c: string): string {
  return c === "#FFED00" ? "#c4a900" : c;
}

/**
 * Dot-based hemicycle parliament visualization.
 * Distributes seats across concentric semicircular rows
 * with parties arranged left-to-right by political spectrum.
 */
export function Hemicycle({ seats, totalSeats, size = "md", showLegend = true, className }: HemicycleProps) {
  const sorted = useMemo(() =>
    [...seats].filter(s => s.count > 0).sort((a, b) => spectrumIndex(a.partyId) - spectrumIndex(b.partyId)),
    [seats]
  );

  const total = totalSeats ?? sorted.reduce((s, g) => s + g.count, 0);

  const dots = useMemo(() => {
    if (total === 0) return [];

    // Determine number of rows based on total seats
    const numRows = total <= 100 ? 5 : total <= 300 ? 7 : total <= 500 ? 9 : total <= 800 ? 11 : 13;

    // Radii range (normalized 0-1, will be scaled by viewBox)
    const innerR = 0.35;
    const outerR = 0.95;
    const rowGap = (outerR - innerR) / (numRows - 1);

    // Calculate seats per row proportional to arc length (radius)
    const rawPerRow = Array.from({ length: numRows }, (_, i) => {
      const r = innerR + i * rowGap;
      return Math.PI * r; // arc length proportional
    });
    const rawTotal = rawPerRow.reduce((s, v) => s + v, 0);
    const seatsPerRow = rawPerRow.map(v => Math.round((v / rawTotal) * total));

    // Fix rounding errors
    const diff = total - seatsPerRow.reduce((s, v) => s + v, 0);
    if (diff !== 0) {
      // Adjust the largest row
      const maxIdx = seatsPerRow.indexOf(Math.max(...seatsPerRow));
      seatsPerRow[maxIdx] += diff;
    }

    // Build flat list of party-colored seats
    const colorList: string[] = [];
    for (const group of sorted) {
      for (let i = 0; i < group.count; i++) {
        colorList.push(fixColor(group.color));
      }
    }

    // Distribute dots across rows
    const result: { x: number; y: number; color: string }[] = [];
    let seatIdx = 0;

    for (let row = 0; row < numRows; row++) {
      const r = innerR + row * rowGap;
      const count = seatsPerRow[row];
      if (count === 0) continue;

      for (let i = 0; i < count; i++) {
        // Angle from π (left) to 0 (right)
        const angle = Math.PI - (i / (count - 1 || 1)) * Math.PI;
        const x = 0.5 + r * Math.cos(angle);
        const y = 1.0 - r * Math.sin(angle);
        const color = seatIdx < colorList.length ? colorList[seatIdx] : "#ccc";
        result.push({ x, y, color });
        seatIdx++;
      }
    }

    return result;
  }, [sorted, total]);

  // Size configs
  const sizeConfig = {
    sm: { width: 240, dotR: 0.008 },
    md: { width: 360, dotR: 0.007 },
    lg: { width: 480, dotR: 0.006 },
  }[size];

  return (
    <div className={className}>
      <svg
        viewBox="0 0 1 0.58"
        style={{ width: "100%", maxWidth: sizeConfig.width }}
        preserveAspectRatio="xMidYMid meet"
      >
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={sizeConfig.dotR} fill={d.color} />
        ))}
        <text
          x={0.5}
          y={0.55}
          textAnchor="middle"
          fontSize={0.04}
          fontWeight="700"
          fill="#333"
          fontFamily="Inter, sans-serif"
        >
          {total}
        </text>
      </svg>

      {showLegend && sorted.length > 0 && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
          {sorted.map(g => (
            <div key={g.partyId} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: fixColor(g.color) }}
              />
              <span className="font-medium text-foreground">{g.name}</span>
              <span className="text-muted-foreground tabular-nums">{g.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
