import { useMemo } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import "highcharts/modules/item-series";

interface SeatGroup {
  partyId: string;
  count: number;
  color: string;
  name: string;
}

interface HemicycleProps {
  seats: SeatGroup[];
  coalitionIds?: string[];
  totalSeats?: number;
  size?: "sm" | "md" | "lg";
  showLegend?: boolean;
  className?: string;
}

function fixColor(c: string): string {
  return c === "#FFED00" ? "#c4a900" : c;
}

const MAX_WIDTH = { sm: 440, md: 600, lg: 800 };

/**
 * Parliament hemicycle using Highcharts item-series.
 * Ordered from left: coalition parties (by seats desc), then opposition (by seats desc).
 */
export function Hemicycle({ seats, coalitionIds = [], totalSeats, size = "md", showLegend = true, className }: HemicycleProps) {
  const coalitionSet = useMemo(() => new Set(coalitionIds), [coalitionIds]);

  const { sorted, coalition, opposition } = useMemo(() => {
    const valid = seats.filter(s => s.count > 0);
    const coal = valid.filter(s => coalitionSet.has(s.partyId)).sort((a, b) => b.count - a.count);
    const opp = valid.filter(s => !coalitionSet.has(s.partyId)).sort((a, b) => b.count - a.count);
    return { sorted: [...coal, ...opp], coalition: coal, opposition: opp };
  }, [seats, coalitionSet]);

  const total = totalSeats ?? sorted.reduce((s, g) => s + g.count, 0);

  const options = useMemo<Highcharts.Options>(() => ({
    chart: {
      type: "item",
      backgroundColor: "transparent",
      style: { fontFamily: "Inter, sans-serif" },
    },
    title: {
      text: `${total} Sitze`,
      align: "center",
      style: { fontSize: "16px", fontWeight: "700" },
    },
    credits: { enabled: false },
    exporting: { enabled: false },
    legend: { enabled: false },
    series: [{
      type: "item",
      name: "Sitze",
      keys: ["name", "y", "color", "label"],
      data: sorted.map(g => [g.name, g.count, fixColor(g.color), g.name]),
      dataLabels: { enabled: false },
      center: ["50%", "88%"],
      size: "170%",
      startAngle: -100,
      endAngle: 100,
    } as unknown as Highcharts.SeriesOptionsType],
    tooltip: {
      headerFormat: "",
      pointFormat: '<span style="color:{point.color}">\u25CF</span> {point.name}: <b>{point.y} Sitze</b>',
    },
    responsive: {
      rules: [{
        condition: { maxWidth: 600 },
        chartOptions: {
          series: [{
            dataLabels: { distance: -30 },
          }] as unknown as Highcharts.SeriesOptionsType[],
        },
      }],
    },
  }), [sorted, total]);

  const srDescription = useMemo(() => {
    if (sorted.length === 0) return "";
    const parts = sorted.map(g => `${g.name}: ${g.count} Sitze`);
    return `Sitzverteilung im Bundestag — ${total} Sitze gesamt. ${parts.join(", ")}.`;
  }, [sorted, total]);

  if (total === 0) return null;

  return (
    <div className={className} style={{ width: "100%", maxWidth: MAX_WIDTH[size] }} role="figure" aria-label={srDescription}>
      <HighchartsReact highcharts={Highcharts} options={options} />
      <span className="sr-only">{srDescription}</span>
      {showLegend && sorted.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 mt-1 px-2">
          <LegendColumn label="Koalition" parties={coalition} />
          <LegendColumn label="Opposition" parties={opposition} />
        </div>
      )}
    </div>
  );
}

function LegendColumn({ label, parties }: { label: string; parties: SeatGroup[] }) {
  if (parties.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="space-y-0.5">
        {parties.map(g => (
          <div key={g.partyId} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fixColor(g.color) }} />
            <span className="font-medium">{g.name}</span>
            <span className="text-muted-foreground tabular-nums">{g.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
