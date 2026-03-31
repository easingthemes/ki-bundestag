import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useTranslation } from "react-i18next";
import { type PartyHistory } from "../../api";

interface ApprovalChartProps {
  history: PartyHistory[];
  color: string;
  partyId: string;
}

export function ApprovalChart({ history, color, partyId }: ApprovalChartProps) {
  const { t } = useTranslation("parties");
  if (history.length < 2) return null;
  const partyColor = color === "#FFED00" ? "#c4a900" : color;
  const chartData = history.map(h => ({ day: h.dayNumber, approval: h.approvalRating }));
  const gradId = `grad-${partyId}`;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={partyColor} stopOpacity={0.25} />
            <stop offset="95%" stopColor={partyColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11 }}
          tickLine={false}
          label={{ value: t("approvalChart.xLabel"), position: "insideBottomRight", offset: -4, fontSize: 11 }}
        />
        <YAxis
          domain={[0, 60]}
          tick={{ fontSize: 11 }}
          tickLine={false}
          width={32}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          formatter={(v: number) => [`${v.toFixed(1)}%`, t("approvalChart.tooltipValue")]}
          labelFormatter={(l: number) => t("approvalChart.tooltipLabel", { day: l })}
        />
        <Area
          type="monotone"
          dataKey="approval"
          stroke={partyColor}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
