import { useState, useEffect, useCallback } from "react";
import { api, CitizenQuestion, Party } from "../api";
import { usePolling } from "../usePolling";

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

      <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <select
          value={filterParty}
          onChange={e => setFilterParty(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #ddd", fontSize: "0.85rem" }}
        >
          <option value="">All parties</option>
          {parties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #ddd", fontSize: "0.85rem" }}
        >
          <option value="">All status</option>
          <option value="pending">Pending</option>
          <option value="answered">Answered</option>
        </select>
      </div>

      {questions.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem", color: "#888" }}>
          No questions yet. Visit a party's page to submit a question.
        </div>
      ) : (
        <>
          {questions.slice(0, visibleCount).map(q => (
            <div
              key={q.id}
              className="question-card"
              style={{ borderLeftColor: getPartyColor(q.targetPartyId) }}
            >
              <div className="question-header">
                <span className="question-party">{getPartyName(q.targetPartyId)}</span>
                <span className={`badge ${q.status === "pending" ? "question-badge-pending" : "question-badge-answered"}`}>
                  {q.status}
                </span>
                <span style={{ fontSize: "0.75rem", color: "#888", marginLeft: "auto" }}>
                  Day {q.createdOnDay}
                </span>
              </div>
              <div className="question-text">{q.question}</div>
              {q.response && (
                <div className="question-response">
                  <strong>{getPartyName(q.targetPartyId)}:</strong> {q.response}
                </div>
              )}
            </div>
          ))}
          {questions.length > visibleCount && (
            <div style={{ textAlign: "center", margin: "1rem 0" }}>
              <button
                onClick={() => setVisibleCount(c => c + 10)}
                style={{
                  padding: "0.5rem 1.5rem",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  background: "white",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                Show {Math.min(10, questions.length - visibleCount)} more ({questions.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
