import { type MdbSpeech } from "../../api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MDB_BADGE } from "@/lib/colors";

interface SpeechDisplayProps {
  speeches: MdbSpeech[];
}

export function SpeechDisplay({ speeches }: SpeechDisplayProps) {
  if (speeches.length === 0) {
    return <div className="text-sm text-muted-foreground">No speeches submitted yet.</div>;
  }

  return (
    <div>
      {speeches.map(s => (
        <Card key={s.id} className="mb-2">
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn("text-xs", MDB_BADGE)}>MdB</Badge>
                <span className="font-semibold text-sm">{s.displayName ?? "MdB"}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Reading {s.reading} · Day {s.dayNumber}
              </span>
            </div>
            <div className="text-sm text-muted-foreground leading-relaxed">{s.content}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
