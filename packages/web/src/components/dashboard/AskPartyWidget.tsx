import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type Party } from "../../api";
import { Button } from "../shared";
import { Card, CardContent } from "@/components/ui/card";

interface AskPartyWidgetProps {
  parties: Party[];
  coalitionParties: string[];
}

export function AskPartyWidget({ parties, coalitionParties }: AskPartyWidgetProps) {
  const { t } = useTranslation("dashboard");
  const seatedParties = parties.filter(p => p.seatCount > 0);
  const defaultPartyId = coalitionParties[0] || (seatedParties[0]?.id ?? "");
  const [selectedPartyId, setSelectedPartyId] = useState(defaultPartyId);
  const [questionText, setQuestionText] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async () => {
    if (questionText.length < 5 || questionText.length > 140) return;
    setSubmitStatus("submitting");
    try {
      await api.submitQuestion(questionText, selectedPartyId);
      setSubmitStatus("success");
      setQuestionText("");
      setTimeout(() => setSubmitStatus("idle"), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Submission failed");
      setSubmitStatus("error");
      setTimeout(() => setSubmitStatus("idle"), 4000);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("askParty.frageStellen")}</span>
          <Link to="/questions" className="text-[11px] font-medium text-primary hover:underline">{t("askParty.alleFragenLink")}</Link>
        </div>
        <select
          value={selectedPartyId}
          onChange={e => setSelectedPartyId(e.target.value)}
          className="border-input h-8 w-full rounded-md border bg-transparent px-2.5 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] mb-1.5"
          aria-label={t("askParty.parteiWaehlen")}
        >
          {seatedParties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder={t("askParty.placeholder")}
            value={questionText}
            onChange={e => setQuestionText(e.target.value)}
            maxLength={140}
            className="border-input h-8 flex-1 rounded-md border bg-transparent px-2.5 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          <Button onClick={handleSubmit} disabled={submitStatus === "submitting" || questionText.length < 5} loading={submitStatus === "submitting"} size="sm" variant="primary">
            {t("askParty.fragen")}
          </Button>
        </div>
        {submitStatus === "success" && (
          <div className="mt-1.5 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 text-xs">{t("askParty.eingereicht")}</div>
        )}
        {submitStatus === "error" && (
          <div className="mt-1.5 px-2.5 py-1 rounded bg-red-50 text-red-700 text-xs">{errorMsg}</div>
        )}
      </CardContent>
    </Card>
  );
}
