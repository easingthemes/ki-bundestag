import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Party } from "../../api";
import { useUser } from "../../userContext";
import { cn } from "@/lib/utils";

interface OnboardingOverlayProps {
  externalOpen?: boolean;
  onClose?: () => void;
  parties: Party[];
}

export function OnboardingOverlay({ externalOpen, onClose, parties }: OnboardingOverlayProps) {
  const { t } = useTranslation("dashboard");
  const { user, updateUser } = useUser();
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  // Join party state
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [joinStatus, setJoinStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [joinError, setJoinError] = useState("");

  // Ask question state
  const [askPartyId, setAskPartyId] = useState("");
  const [askText, setAskText] = useState("");
  const [askStatus, setAskStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    if (user && localStorage.getItem("ki-onboarding") === "1") {
      setShow(true);
    }
  }, [user]);

  // External trigger (re-open from dashboard)
  useEffect(() => {
    if (externalOpen) setShow(true);
  }, [externalOpen]);

  // Set defaults when parties load
  useEffect(() => {
    if (parties.length > 0) {
      if (!selectedPartyId) setSelectedPartyId(parties[0].id);
      if (!askPartyId) setAskPartyId(parties[0].id);
    }
  }, [parties, selectedPartyId, askPartyId]);

  if (!show) return null;

  const seatedParties = parties.filter(p => p.seatCount > 0);
  const alreadyInParty = !!user?.partyId;
  const currentParty = alreadyInParty ? parties.find(p => p.id === user!.partyId) : null;

  const handleJoin = async () => {
    if (!selectedPartyId) return;
    setJoinStatus("loading");
    try {
      const result = await api.joinParty(selectedPartyId);
      updateUser(result);
      setJoinStatus("success");
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Beitritt fehlgeschlagen");
      setJoinStatus("error");
    }
  };

  const handleAsk = async () => {
    if (askText.length < 5 || askText.length > 140) return;
    setAskStatus("loading");
    try {
      await api.submitQuestion(askText, askPartyId);
      setAskStatus("success");
      setAskText("");
    } catch {
      setAskStatus("error");
    }
  };

  const dismiss = () => {
    localStorage.removeItem("ki-onboarding");
    setShow(false);
    setStep(0);
    setJoinStatus("idle");
    setAskStatus("idle");
    onClose?.();
  };

  const steps = [
    {
      title: t("onboarding.schritt1Titel"),
      desc: t("onboarding.schritt1Desc"),
      content: (
        <div className="mt-3">
          {alreadyInParty ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: currentParty?.color }} />
              {t("onboarding.mitglied")} <strong>{currentParty?.name}</strong>
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={selectedPartyId}
                onChange={e => { setSelectedPartyId(e.target.value); setJoinStatus("idle"); }}
                aria-label={t("askParty.parteiWaehlen")}
                className="border-input h-9 w-full rounded-md border bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                {seatedParties.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.ideology} ({p.memberCount} Mitglieder)</option>
                ))}
              </select>
              <button
                onClick={handleJoin}
                disabled={joinStatus === "loading" || joinStatus === "success"}
                className={cn(
                  "w-full px-4 py-2 text-sm rounded font-medium cursor-pointer transition-colors",
                  joinStatus === "success"
                    ? "bg-emerald-600 text-white"
                    : "bg-foreground text-background hover:opacity-90"
                )}
              >
                {joinStatus === "loading" ? "..." : joinStatus === "success" ? t("onboarding.beigetreten") : t("onboarding.beitreten")}
              </button>
              {joinStatus === "error" && (
                <div role="alert" aria-live="assertive" className="text-xs text-destructive">{joinError}</div>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t("onboarding.schritt2Titel"),
      desc: t("onboarding.schritt2Desc"),
      content: (
        <div className="mt-3 space-y-2">
          <select
            value={askPartyId}
            onChange={e => setAskPartyId(e.target.value)}
            aria-label={t("askParty.parteiWaehlen")}
            className="border-input h-9 w-full rounded-md border bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            {seatedParties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder={t("askParty.placeholder")}
              aria-label={t("askParty.placeholder")}
              value={askText}
              onChange={e => setAskText(e.target.value)}
              maxLength={140}
              className="border-input h-9 flex-1 rounded-md border bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
            <button
              onClick={handleAsk}
              disabled={askStatus === "loading" || askText.length < 5 || askStatus === "success"}
              className={cn(
                "px-4 py-2 text-sm rounded font-medium cursor-pointer shrink-0 transition-colors",
                askStatus === "success"
                  ? "bg-emerald-600 text-white"
                  : "bg-foreground text-background hover:opacity-90"
              )}
            >
              {askStatus === "loading" ? "..." : askStatus === "success" ? t("onboarding.gesendet") : t("onboarding.fragen")}
            </button>
          </div>
          {askStatus === "error" && (
            <div role="alert" aria-live="assertive" className="text-xs text-destructive">{t("onboarding.fehlerBeimSenden")}</div>
          )}
        </div>
      ),
    },
    {
      title: t("onboarding.schritt3Titel"),
      desc: t("onboarding.schritt3Desc"),
      content: (
        <div className="mt-3">
          <a href="/polls#active-polls" onClick={dismiss} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline font-medium">
            {t("onboarding.schritt3Link")}
          </a>
        </div>
      ),
    },
    {
      title: t("onboarding.schritt4Titel"),
      desc: t("onboarding.schritt4Desc"),
      content: (
        <div className="mt-3">
          {alreadyInParty || joinStatus === "success" ? (
            <a href={`/parties/${user?.partyId ?? selectedPartyId}#proposals`} onClick={dismiss} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline font-medium">
              {t("onboarding.schritt4Link")}
            </a>
          ) : (
            <div className="text-sm text-muted-foreground italic">{t("onboarding.erstParteiSchritt1")}</div>
          )}
        </div>
      ),
    },
    {
      title: t("onboarding.schritt5Titel"),
      desc: t("onboarding.schritt5Desc"),
      content: (
        <div className="mt-3">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2.5">
            <span>{t("onboarding.parteimitgliedSein")}</span>
            <span>·</span>
            <span>{t("onboarding.kiPrueftBewerbung")}</span>
            <span>·</span>
            <span>{t("onboarding.wartezeit")}</span>
          </div>
          {alreadyInParty || joinStatus === "success" ? (
            <a href={`/parties/${user?.partyId ?? selectedPartyId}#mdb-seats`} onClick={dismiss} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline font-medium">
              {t("onboarding.schritt5Link")}
            </a>
          ) : (
            <div className="text-sm text-muted-foreground italic">{t("onboarding.erstParteiSchritt1")}</div>
          )}
        </div>
      ),
    },
  ];

  const current = steps[step];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={dismiss}
      onKeyDown={e => { if (e.key === "Escape") dismiss(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-muted-foreground">{t("onboarding.schritt", { current: step + 1, total: steps.length })}</span>
          <button onClick={dismiss} aria-label={t("onboarding.ueberspringen")} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">{t("onboarding.ueberspringen")}</button>
        </div>
        <h3 id="onboarding-title" className="text-lg font-semibold mb-1">{current.title}</h3>
        <p className="text-sm text-muted-foreground">{current.desc}</p>
        {current.content}
        <div className="flex items-center gap-2 mt-4">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="px-3 py-2 text-sm rounded border border-input hover:bg-accent cursor-pointer">
              {t("onboarding.zurueck")}
            </button>
          )}
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)} className="px-4 py-2 text-sm rounded bg-foreground text-background font-medium cursor-pointer hover:opacity-90">
              {t("onboarding.weiter")}
            </button>
          ) : (
            <button onClick={dismiss} className="px-4 py-2 text-sm rounded bg-foreground text-background font-medium cursor-pointer hover:opacity-90">
              {t("onboarding.losgehts")}
            </button>
          )}
        </div>
        <div className="flex justify-center gap-1.5 mt-4">
          {steps.map((_, i) => (
            <button key={i} onClick={() => setStep(i)} aria-label={t("onboarding.schritt", { current: i + 1, total: steps.length })} className={cn("w-2 h-2 rounded-full border-none cursor-pointer p-0", i === step ? "bg-foreground" : i < step ? "bg-foreground/40" : "bg-muted")} />
          ))}
        </div>
      </div>
    </div>
  );
}
