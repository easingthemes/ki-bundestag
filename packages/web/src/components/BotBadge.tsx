import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function BotBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-medium px-1.5 py-0 border-sky-400/40 text-sky-400 bg-sky-400/10",
        className,
      )}
    >
      Bot
    </Badge>
  );
}
