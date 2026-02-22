import { type TimingPreset } from "../../api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRESET_BADGE } from "@/lib/colors";

const PRESET_OPTIONS: { value: TimingPreset; label: string; desc: string; participatory: boolean }[] = [
  { value: "ultra-fast", label: "Ultra-Fast", desc: "No delay between days", participatory: false },
  { value: "fast", label: "Fast", desc: "7 min between days", participatory: false },
  { value: "normal", label: "Normal", desc: "30 min day / 15 min night", participatory: true },
  { value: "slow", label: "Slow", desc: "1.5 h between days, night pause", participatory: true },
];

interface PresetSelectorProps {
  currentPreset: TimingPreset | undefined;
  selectedPreset: TimingPreset;
  onSelect: (preset: TimingPreset) => void;
  onApply: () => void;
  saving: boolean;
}

export function PresetSelector({ currentPreset, selectedPreset, onSelect, onApply, saving }: PresetSelectorProps) {
  return (
    <div className="mb-8">
      <h2 className="section-title">Simulationsgeschwindigkeit</h2>
      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground mb-4">
            Controls how fast simulation days progress. Ultra-Fast and Fast are watch-only (no user participation).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {PRESET_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                  selectedPreset === opt.value ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/30",
                )}
              >
                <input
                  type="radio"
                  name="preset"
                  value={opt.value}
                  checked={selectedPreset === opt.value}
                  onChange={() => onSelect(opt.value)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{opt.label}</span>
                    <Badge variant="outline" className={PRESET_BADGE[opt.value]}>
                      {opt.participatory ? "Interactive" : "Watch-only"}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                saving
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : selectedPreset === currentPreset
                    ? "bg-muted text-muted-foreground cursor-default"
                    : "bg-foreground text-background hover:bg-foreground/90",
              )}
              disabled={saving || selectedPreset === currentPreset}
              onClick={onApply}
            >
              {saving ? "Saving..." : "Apply"}
            </button>
            {currentPreset && selectedPreset !== currentPreset && (
              <span className="text-xs text-muted-foreground">
                Current: {PRESET_OPTIONS.find(o => o.value === currentPreset)?.label ?? currentPreset}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
