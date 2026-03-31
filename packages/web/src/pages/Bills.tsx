import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, Bill, Party, type BundestagSeat } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton, UserActionIcon, MdbActionIcon } from "../components/shared";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, VOTE_COLORS, GOVT_BILL_BADGE, MEMBER_INITIATIVE_BADGE, PRESIDENTIAL_VETO_BADGE, ALERT_STYLES } from "@/lib/colors";
import { VoteBar } from "@/components/VoteBar";
import { useTranslation } from "react-i18next";

const GROUP_INITIAL = 5;

const STATUS_ORDER = ["third_reading", "second_reading", "committee", "first_reading", "proposed", "passed", "rejected", "struck_down", "debate"];

const BILL_CATEGORIES = ["economy", "social", "environment", "immigration", "defense", "education", "healthcare", "infrastructure"];

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function Bills() {
  const { t } = useTranslation("legislation");
  const { user } = useUser();
  const [bills, setBills] = useState<Bill[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterParty, setFilterParty] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({});
  const [mySeat, setMySeat] = useState<BundestagSeat | null>(null);

  useEffect(() => {
    if (user) api.getMySeat().then(r => setMySeat(r.seat)).catch(() => {});
  }, [user]);

  const refresh = useCallback(() => {
    api.getBills().then(setBills).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  // Reset per-group limits when filters change
  useEffect(() => { setGroupLimits({}); }, [filterCategory, filterParty, filterSearch, filterStatus]);

  if (parties.length === 0) return <div className="py-8"><LoadingSkeleton lines={4} /></div>;

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
    bills: filteredBills.filter(b => b.status === status).sort((a, b) => b.proposedOnDay - a.proposedOnDay),
  })).filter(g => g.bills.length > 0);

  const hasFilters = !!(filterCategory || filterParty || filterSearch || filterStatus);

  const signalReadyCount = filteredBills.filter(b => b.status === "second_reading" || b.status === "third_reading").length;

  return (
    <div>
      <h2 className="section-title">{t("title")}</h2>

      {/* Registration prompt */}
      {!user && signalReadyCount > 0 && (
        <div className={cn(ALERT_STYLES.info, "mb-4")}>
          <Link to="/parties" className="text-blue-700 font-semibold hover:underline">{t("registerPrompt")}</Link> {t("registerPromptSuffix")}
        </div>
      )}

      {/* Signal-ready nudge for members */}
      {user && user.partyId && signalReadyCount > 0 && (
        <div className={cn(ALERT_STYLES.warning, "mb-4")}>
          {t("signalNudge", { count: signalReadyCount })}
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-4 items-center">
        <input
          type="text"
          placeholder={t("filter.searchPlaceholder")}
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          className={cn(SELECT_CLS, "min-w-40")}
        />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={SELECT_CLS}>
          <option value="">{t("filter.allCategories")}</option>
          {BILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterParty} onChange={e => setFilterParty(e.target.value)} className={SELECT_CLS}>
          <option value="">{t("filter.allParties")}</option>
          {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={SELECT_CLS}>
          <option value="">{t("filter.allStatus")}</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{t(`status.${s}`, s.replace("_", " "))}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterCategory(""); setFilterParty(""); setFilterSearch(""); setFilterStatus(""); }}
            className="h-9 px-3 text-xs rounded-md border border-input bg-secondary hover:bg-accent cursor-pointer"
          >
            {t("filter.reset")}
          </button>
        )}
        <span className="text-xs text-muted-foreground ml-1">
          {t("filter.billCount", { count: filteredBills.length })}
        </span>
      </div>

      {bills.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">{t("empty")}</p>
      )}
      {grouped.map(group => {
        const limit = groupLimits[group.status] ?? GROUP_INITIAL;
        const visible = group.bills.slice(0, limit);
        return (
          <div key={group.status} className="mb-8">
            <h2 className="section-title">
              {t(`status.${group.status}`, group.status)} ({group.bills.length})
            </h2>
            {visible.map(bill => (
              <BillCard key={bill.id} bill={bill} partyMap={partyMap} isMember={!!user?.partyId} hasSeat={!!mySeat} />
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

function BillCard({ bill, partyMap, isMember, hasSeat }: { bill: Bill; partyMap: Map<string, Party>; isMember: boolean; hasSeat: boolean }) {
  const { t } = useTranslation("legislation");
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
    <Card className="mb-3">
      <CardContent className="p-5">
        <div className="flex justify-between items-center">
          <div>
            <Link to={`/bills/${bill.id}`} className="text-inherit no-underline">
              <strong>{bill.title}</strong>
            </Link>
            <span className="ml-2 text-xs text-muted-foreground">({bill.category})</span>
          </div>
          <span className="flex gap-1.5 items-center">
            {hasSeat && ["first_reading", "second_reading", "third_reading"].includes(bill.status) && (
              <MdbActionIcon title={bill.status === "third_reading" ? t("mdbAction") : t("mdbSpeechAction")} />
            )}
            {isMember && !hasSeat && (bill.status === "second_reading" || bill.status === "third_reading") && (
              <UserActionIcon title={t("signalAction")} />
            )}
            {bill.isGovernmentBill && (
              <Badge variant="outline" className={GOVT_BILL_BADGE}>{t("badges.govtBill")}</Badge>
            )}
            {bill.memberInitiative && (
              <Badge className={MEMBER_INITIATIVE_BADGE}>{t("badges.memberInitiative")}</Badge>
            )}
            {bill.vetoedByPresident && (
              <Badge variant="outline" className={PRESIDENTIAL_VETO_BADGE}>{t("badges.presidentialVeto")}</Badge>
            )}
            <Badge variant="outline" className={STATUS_BADGE[bill.status] || ""}>
              {t(`status.${bill.status}`, bill.status)}
            </Badge>
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{bill.description}</p>
        <p className="text-xs text-muted-foreground">
          {t("proposedBy")} {bill.memberInitiative && bill.proposerDisplayName
            ? <><span className="font-medium text-purple-700">{bill.proposerDisplayName}</span> ({proposer?.name ?? bill.proposedBy})</>
            : proposer?.name ?? bill.proposedBy
          } {t("onDay", { day: bill.proposedOnDay })}
        </p>

        {bill.committeeName && (
          <p className="text-xs text-muted-foreground mt-1">
            {t("committeeLabel")}: <strong>{bill.committeeName}</strong>
            {bill.committeeRecommendation && (
              <span className="ml-2">
                — {t("committeeRecommendation")}: <span
                  className="font-semibold"
                  style={{
                    color: bill.committeeRecommendation === "pass" ? "#155724"
                      : bill.committeeRecommendation === "reject" ? "#721c24"
                      : "#856404"
                  }}
                >
                  {bill.committeeRecommendation === "pass" ? t("recommendationPass") : bill.committeeRecommendation === "reject" ? t("recommendationReject") : t("recommendationAmend")}
                </span>
              </span>
            )}
          </p>
        )}

        {amendments.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1">
              {t("amendmentsLabel")} ({amendments.length}):
            </p>
            {amendments.map(a => (
              <div key={a.id} className="text-xs text-muted-foreground py-0.5 flex items-center gap-1.5">
                <Badge variant="outline" className={cn(
                  "text-xs px-1.5 py-0",
                  a.accepted ? STATUS_BADGE.passed : STATUS_BADGE.rejected
                )}>
                  {a.accepted ? t("amendmentAccepted") : t("amendmentRejected")}
                </Badge>
                <span>„{a.title}" von {partyMap.get(a.proposedBy)?.name ?? a.proposedBy}</span>
              </div>
            ))}
          </div>
        )}

        {bill.votes.length > 0 && totalSeats > 0 && (
          <>
            <div className="my-2">
              <VoteBar yes={yesSeats} no={noSeats} abstain={abstainSeats} total={totalSeats} showCounts />
            </div>
            <div className="mt-2">
              {bill.votes.map(v => {
                const p = partyMap.get(v.partyId);
                return (
                  <div key={v.partyId} className="flex items-center gap-2 text-sm py-1">
                    <span className={cn(
                      "size-2.5 rounded-full shrink-0",
                      v.vote === "yes" ? VOTE_COLORS.yes : v.vote === "no" ? VOTE_COLORS.no : VOTE_COLORS.abstain
                    )} />
                    <strong>{p?.name ?? v.partyId}</strong>
                    <span className="text-muted-foreground">— {v.reason}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
