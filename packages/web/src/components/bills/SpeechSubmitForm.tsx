import { useState } from "react";
import { api, type BundestagSeat } from "../../api";
import { Card, CardContent } from "@/components/ui/card";
import { useUser } from "../../userContext";
import { useDailyLimit } from "@/hooks/useDailyLimit";

interface SpeechSubmitFormProps {
  billId: string;
  billStatus: string;
  displayColor: string;
  userSeat: BundestagSeat;
  onSubmitted: () => void;
}

export function SpeechSubmitForm({ billId, billStatus, displayColor, onSubmitted }: SpeechSubmitFormProps) {
  const { user } = useUser();
  const { info: limitInfo, refresh: refreshLimit, isAtLimit } = useDailyLimit("submit_speech", user?.id);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (content.trim().length < 20 || isAtLimit) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const reading = billStatus === "first_reading" ? 1 : billStatus === "second_reading" ? 2 : 3;
      await api.submitSpeech(billId, reading, content.trim());
      setContent("");
      setMsg("Rede eingereicht!");
      refreshLimit();
      onSubmitted();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Einreichen fehlgeschlagen");
    } finally {
      setSubmitting(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  if (isAtLimit) {
    return (
      <Card className="mb-3"><CardContent className="p-5">
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Tageslimit erreicht ({limitInfo?.used}/{limitInfo?.limit} Reden in 24h). Versuchen Sie es später erneut.
        </div>
      </CardContent></Card>
    );
  }

  return (
    <Card className="mb-3"><CardContent className="p-5">
      <div className="flex justify-between items-center mb-2">
        <div className="font-semibold text-sm">Rede einreichen</div>
        {limitInfo && limitInfo.remaining <= 2 && (
          <span className="text-xs text-muted-foreground">Noch {limitInfo.remaining} Rede{limitInfo.remaining !== 1 ? "n" : ""} heute</span>
        )}
      </div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Ihre Rede (20–500 Zeichen)"
        maxLength={500}
        rows={3}
        className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2 resize-y"
      />
      <div className="flex gap-2 items-center">
        <button
          onClick={handleSubmit}
          disabled={submitting || content.trim().length < 20}
          className="px-3.5 py-1.5 rounded border-none text-white font-semibold text-sm cursor-pointer disabled:opacity-50"
          style={{ background: displayColor }}
        >
          {submitting ? "Wird eingereicht…" : "Rede einreichen"}
        </button>
        {msg && <span className={`text-xs ${msg.includes("fehlgeschlagen") ? "text-destructive" : "text-emerald-500"}`}>{msg}</span>}
      </div>
    </CardContent></Card>
  );
}
