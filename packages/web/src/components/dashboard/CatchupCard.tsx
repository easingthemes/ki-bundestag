import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CatchupData } from "../../api";
import { useUser } from "../../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { SEMANTIC_HEX } from "@/lib/colors";

export function CatchupCard() {
  const { user } = useUser();
  const [catchup, setCatchup] = useState<CatchupData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.getMyCatchup().then(setCatchup).catch(() => {});
  }, [user]);

  if (!user || !catchup || catchup.daysMissed < 3 || dismissed) return null;

  const hasContent = catchup.billsPassed.length > 0 || catchup.billsRejected.length > 0 || catchup.crisesStarted.length > 0 || catchup.crisesEnded.length > 0 || catchup.proposalOutcomes.length > 0;
  if (!hasContent) return null;

  return (
    <Card className="mb-5 border-l-4 border-l-blue-500">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="font-bold text-sm">Während deiner Abwesenheit</div>
            <div className="text-xs text-muted-foreground">{catchup.daysMissed} Simulationstage verpasst</div>
          </div>
          <button onClick={() => setDismissed(true)} className="text-xs text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer">Schließen</button>
        </div>
        <div className="text-sm space-y-1.5">
          {catchup.billsPassed.length > 0 && (
            <div>
              <span className="font-medium text-emerald-600">{catchup.billsPassed.length} Gesetz{catchup.billsPassed.length !== 1 ? "e" : ""} angenommen</span>
              {catchup.billsPassed.slice(0, 2).map(b => (
                <Link key={b.id} to={`/bills/${b.id}`} className="block text-xs text-muted-foreground hover:underline ml-2 truncate">{b.title}</Link>
              ))}
            </div>
          )}
          {catchup.billsRejected.length > 0 && (
            <div><span className="font-medium text-destructive">{catchup.billsRejected.length} Gesetz{catchup.billsRejected.length !== 1 ? "e" : ""} abgelehnt</span></div>
          )}
          {catchup.crisesStarted.length > 0 && (
            <div>
              <span className="font-medium text-red-600">{catchup.crisesStarted.length} neue Krise{catchup.crisesStarted.length !== 1 ? "n" : ""}</span>
              {catchup.crisesStarted.map(c => (
                <span key={c.id} className="block text-xs text-muted-foreground ml-2">{c.name} ({c.severity})</span>
              ))}
            </div>
          )}
          {catchup.crisesEnded.length > 0 && (
            <div className="text-xs text-muted-foreground">{catchup.crisesEnded.length} Krise{catchup.crisesEnded.length !== 1 ? "n" : ""} beendet</div>
          )}
          {catchup.partyApprovalDelta != null && catchup.partyApprovalDelta !== 0 && (
            <div className="text-xs">
              Deine Partei: <span style={{ color: catchup.partyApprovalDelta > 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                {catchup.partyApprovalDelta > 0 ? "+" : ""}{catchup.partyApprovalDelta.toFixed(1)} Zustimmung
              </span>
            </div>
          )}
          {catchup.proposalOutcomes.length > 0 && (
            <div className="text-xs text-muted-foreground">{catchup.proposalOutcomes.length} deiner Vorschläge geprüft</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
