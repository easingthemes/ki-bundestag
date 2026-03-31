import { cn } from "@/lib/utils";
import { VOTE_COLORS } from "@/lib/colors";
import { useTranslation } from "react-i18next";

interface VoteBarProps {
  yes: number;
  no: number;
  abstain: number;
  total: number;
  /** Tailwind height class, default "h-5" */
  height?: string;
  showCounts?: boolean;
}

export function VoteBar({ yes, no, abstain, total, height = "h-5", showCounts = false }: VoteBarProps) {
  const { t } = useTranslation("legislation");
  if (total === 0) return null;

  return (
    <>
      <div className={cn("flex rounded overflow-hidden", height)}>
        {yes > 0 && (
          <div className={VOTE_COLORS.yes} style={{ width: `${(yes / total) * 100}%` }} />
        )}
        {no > 0 && (
          <div className={VOTE_COLORS.no} style={{ width: `${(no / total) * 100}%` }} />
        )}
        {abstain > 0 && (
          <div className={VOTE_COLORS.abstain} style={{ width: `${(abstain / total) * 100}%` }} />
        )}
      </div>
      {showCounts && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("voteBar.yes")}: {yes} · {t("voteBar.no")}: {no} · {t("voteBar.abstain")}: {abstain}
        </p>
      )}
    </>
  );
}
