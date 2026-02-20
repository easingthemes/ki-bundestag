import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, Bill, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/ui";
import { useUser } from "../userContext";

const GROUP_INITIAL = 5;

const STATUS_BADGE: Record<string, string> = {
  passed: "badge-passed",
  rejected: "badge-rejected",
  debate: "badge-debate",
  proposed: "badge-proposed",
  first_reading: "badge-first-reading",
  committee: "badge-committee",
  second_reading: "badge-second-reading",
  third_reading: "badge-third-reading",
};

const STATUS_LABELS: Record<string, string> = {
  third_reading: "Third Reading",
  second_reading: "Second Reading",
  committee: "Committee",
  first_reading: "First Reading",
  proposed: "Proposed",
  passed: "Passed",
  rejected: "Rejected",
  debate: "Debate",
};

const STATUS_ORDER = ["third_reading", "second_reading", "committee", "first_reading", "proposed", "passed", "rejected", "struck_down", "debate"];

const BILL_CATEGORIES = ["economy", "social", "environment", "immigration", "defense", "education", "healthcare", "infrastructure"];

export function Bills() {
  const { user } = useUser();
  const [bills, setBills] = useState<Bill[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterParty, setFilterParty] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({});

  const refresh = useCallback(() => {
    api.getBills().then(setBills).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (parties.length === 0) return <div className="loading">Loading...</div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const filteredBills = bills.filter(b => {
    if (filterCategory && b.category !== filterCategory) return false;
    if (filterParty && b.proposedBy !== filterParty) return false;
    if (filterStatus && b.status !== filterStatus) return false;
    if (filterSearch && !b.title.toLowerCase().includes(filterSearch.toLowerCase())) return false;
    return true;
  });

  const grouped = STATUS_ORDER.map(status => ({
    status,
    bills: filteredBills.filter(b => b.status === status),
  })).filter(g => g.bills.length > 0);

  // Reset per-group limits when filters change
  useEffect(() => { setGroupLimits({}); }, [filterCategory, filterParty, filterSearch, filterStatus]);

  const hasFilters = !!(filterCategory || filterParty || filterSearch || filterStatus);

  const signalReadyCount = filteredBills.filter(b => b.status === "second_reading" || b.status === "third_reading").length;

  return (
    <div>
      <h1>Bills</h1>

      {/* Registration prompt */}
      {!user && signalReadyCount > 0 && (
        <div className="nudge-banner">
          <Link to="/parties">Register and join a party</Link> to signal your vote on bills in 2nd and 3rd reading.
        </div>
      )}

      {/* Signal-ready nudge for members */}
      {user && user.partyId && signalReadyCount > 0 && (
        <div className="nudge-banner nudge-action">
          {signalReadyCount} bill{signalReadyCount !== 1 ? "s" : ""} in reading stage — click to signal your position.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search bills..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          style={{ padding: "0.3rem 0.6rem", border: "1px solid #ccc", borderRadius: 4, fontSize: "0.85rem", minWidth: 160 }}
        />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          style={{ padding: "0.3rem 0.6rem", border: "1px solid #ccc", borderRadius: 4, fontSize: "0.85rem" }}>
          <option value="">All categories</option>
          {BILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterParty} onChange={e => setFilterParty(e.target.value)}
          style={{ padding: "0.3rem 0.6rem", border: "1px solid #ccc", borderRadius: 4, fontSize: "0.85rem" }}>
          <option value="">All parties</option>
          {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: "0.3rem 0.6rem", border: "1px solid #ccc", borderRadius: 4, fontSize: "0.85rem" }}>
          <option value="">All statuses</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setFilterCategory(""); setFilterParty(""); setFilterSearch(""); setFilterStatus(""); }}
            style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem", background: "#eee", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}>
            Clear
          </button>
        )}
        <span style={{ fontSize: "0.8rem", color: "#888", marginLeft: 4 }}>
          {filteredBills.length} bill{filteredBills.length !== 1 ? "s" : ""}
        </span>
      </div>

      {bills.length === 0 && (
        <div className="loading">No bills yet. Run the simulation to see bills appear.</div>
      )}
      {grouped.map(group => {
        const limit = groupLimits[group.status] ?? GROUP_INITIAL;
        const visible = group.bills.slice(0, limit);
        return (
          <div key={group.status} className="section">
            <h2>
              {STATUS_LABELS[group.status] ?? group.status} ({group.bills.length})
            </h2>
            {visible.map(bill => (
              <BillCard key={bill.id} bill={bill} partyMap={partyMap} />
            ))}
            <ShowMoreButton
              total={group.bills.length}
              visible={visible.length}
              increment={5}
              onShowMore={() => setGroupLimits(prev => ({ ...prev, [group.status]: limit + 5 }))}
            />
          </div>
        );
      })}
    </div>
  );
}

function BillCard({ bill, partyMap }: { bill: Bill; partyMap: Map<string, Party> }) {
  const proposer = partyMap.get(bill.proposedBy);
  const totalSeats = bill.votes.reduce((sum, v) => {
    const p = partyMap.get(v.partyId);
    return sum + (p?.seatCount ?? 0);
  }, 0);

  const yesSeats = bill.votes
    .filter(v => v.vote === "yes")
    .reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
  const noSeats = bill.votes
    .filter(v => v.vote === "no")
    .reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
  const abstainSeats = bill.votes
    .filter(v => v.vote === "abstain")
    .reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);

  const amendments = bill.amendments ?? [];

  return (
    <div className="card" style={{ marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Link to={`/bills/${bill.id}`} style={{ color: "inherit", textDecoration: "none" }}>
            <strong>{bill.title}</strong>
          </Link>
          <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#888" }}>
            ({bill.category})
          </span>
        </div>
        <span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          {bill.isGovernmentBill && (
            <span className="badge badge-govt-bill">Govt. Bill</span>
          )}
          {bill.memberInitiative && (
            <span className="badge" style={{ background: "#6f42c1", color: "white" }}>Member Initiative</span>
          )}
          {bill.vetoedByPresident && (
            <span className="badge badge-presidential-veto">Vetoed by President</span>
          )}
          <span className={`badge ${STATUS_BADGE[bill.status] || ""}`}>
            {STATUS_LABELS[bill.status] ?? bill.status}
          </span>
        </span>
      </div>
      <div style={{ fontSize: "0.85rem", color: "#555", margin: "0.25rem 0" }}>
        {bill.description}
      </div>
      <div style={{ fontSize: "0.8rem", color: "#888" }}>
        Proposed by {proposer?.name ?? bill.proposedBy} on day {bill.proposedOnDay}
      </div>

      {bill.committeeName && (
        <div style={{ fontSize: "0.8rem", color: "#555", marginTop: "0.25rem" }}>
          Committee: <strong>{bill.committeeName}</strong>
          {bill.committeeRecommendation && (
            <span style={{ marginLeft: "0.5rem" }}>
              — Recommendation: <span style={{
                fontWeight: 600,
                color: bill.committeeRecommendation === "pass" ? "#155724"
                  : bill.committeeRecommendation === "reject" ? "#721c24"
                  : "#856404"
              }}>
                {bill.committeeRecommendation}
              </span>
            </span>
          )}
        </div>
      )}

      {amendments.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#444", marginBottom: "0.25rem" }}>
            Amendments ({amendments.length}):
          </div>
          {amendments.map(a => (
            <div key={a.id} style={{ fontSize: "0.8rem", color: "#555", padding: "0.15rem 0", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span className={`badge ${a.accepted ? "badge-passed" : "badge-rejected"}`} style={{ fontSize: "0.65rem" }}>
                {a.accepted ? "accepted" : "rejected"}
              </span>
              <span>"{a.title}" by {partyMap.get(a.proposedBy)?.name ?? a.proposedBy}</span>
            </div>
          ))}
        </div>
      )}

      {bill.votes.length > 0 && totalSeats > 0 && (
        <>
          <div className="vote-bar">
            {yesSeats > 0 && (
              <div className="vote-bar-yes" style={{ width: `${(yesSeats / totalSeats) * 100}%` }} />
            )}
            {noSeats > 0 && (
              <div className="vote-bar-no" style={{ width: `${(noSeats / totalSeats) * 100}%` }} />
            )}
            {abstainSeats > 0 && (
              <div className="vote-bar-abstain" style={{ width: `${(abstainSeats / totalSeats) * 100}%` }} />
            )}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#888" }}>
            Yes: {yesSeats} · No: {noSeats} · Abstain: {abstainSeats}
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            {bill.votes.map(v => {
              const p = partyMap.get(v.partyId);
              return (
                <div key={v.partyId} className="vote-detail">
                  <span className={`vote-dot vote-dot-${v.vote}`} />
                  <strong>{p?.name ?? v.partyId}</strong>
                  <span style={{ color: "#666" }}>— {v.reason}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
