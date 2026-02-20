import { useState, useEffect, useCallback } from "react";
import { api, CitizenQuestion, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE } from "@/lib/colors";

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function Questions() {
  const [questions, setQuestions] = useState<CitizenQuestion[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [filterParty, setFilterParty] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState(10);

  const refresh = useCallback(() => {
    api.getQuestions(filterParty || undefined, filterStatus || undefined)
      .then(setQuestions).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, [filterParty, filterStatus]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh, 10000);
  useEffect(() => { setVisibleCount(10); }, [filterParty, filterStatus]);

  const getPartyName = (id: string) => parties.find(p => p.id === id)?.name || id;
  const getPartyColor = (id: string) => {
    const c = parties.find(p => p.id === id)?.color;
    return c === "#FFED00" ? "#c4a900" : c || "#888";
  };

  return (
    <div>
      <h1>Bürgerfragen</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        <select value={filterParty} onChange={e => setFilterParty(e.target.value)} className={SELECT_CLS}>
          <option value="">All parties</option>
          {parties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={SELECT_CLS}>
          <option value="">All status</option>
          <option value="pending">Pending</option>
          <option value="answered">Answered</option>
        </select>
      </div>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No questions yet. Visit a party's page to submit a question.
          </CardContent>
        </Card>
      ) : (
        <>
          {questions.slice(0, visibleCount).map(q => (
            <Card key={q.id} className="mb-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getPartyColor(q.targetPartyId) }} />
                  <span className="font-semibold text-sm">{getPartyName(q.targetPartyId)}</span>
                  <Badge variant="outline" className={cn(
                    q.status === "pending"
                      ? STATUS_BADGE.pending
                      : STATUS_BADGE.answered
                  )}>
                    {q.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Day {q.createdOnDay}
                  </span>
                </div>
                <p className="text-sm italic mb-1.5">{q.question}</p>
                {q.response && (
                  <div className="bg-muted rounded p-2 px-3 text-sm leading-relaxed">
                    <strong>{getPartyName(q.targetPartyId)}:</strong> {q.response}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <ShowMoreButton
            total={questions.length}
            visible={Math.min(visibleCount, questions.length)}
            increment={10}
            onShowMore={() => setVisibleCount(c => c + 10)}
          />
        </>
      )}
    </div>
  );
}
