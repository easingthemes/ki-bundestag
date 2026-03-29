import { useState } from "react";
import { api, type BundestagSeat } from "../../api";
import { Card, CardContent } from "@/components/ui/card";

interface SpeechSubmitFormProps {
  billId: string;
  billStatus: string;
  displayColor: string;
  userSeat: BundestagSeat;
  onSubmitted: () => void;
}

export function SpeechSubmitForm({ billId, billStatus, displayColor, onSubmitted }: SpeechSubmitFormProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (content.trim().length < 20) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const reading = billStatus === "first_reading" ? 1 : billStatus === "second_reading" ? 2 : 3;
      await api.submitSpeech(billId, reading, content.trim());
      setContent("");
      setMsg("Rede eingereicht!");
      onSubmitted();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Einreichen fehlgeschlagen");
    } finally {
      setSubmitting(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  return (
    <Card className="mb-3"><CardContent className="p-5">
      <div className="font-semibold text-sm mb-2">Rede einreichen</div>
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
