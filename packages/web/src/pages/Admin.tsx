import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, type TimingPreset, type SimulationStatus } from "../api";
import { cn } from "@/lib/utils";
import { PresetSelector } from "@/components/admin/PresetSelector";
import { InjectForms } from "@/components/admin/InjectForms";
import { ModelConfig } from "@/components/admin/ModelConfig";
import { ActionsReference } from "@/components/admin/ActionsReference";

export function Admin() {
  const [injectMsg, setInjectMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<TimingPreset>("normal");
  const [presetSaving, setPresetSaving] = useState(false);

  useEffect(() => {
    api.getSimulationStatus().then(s => {
      setSimStatus(s);
      setSelectedPreset(s.timingPreset ?? "normal");
    }).catch(console.error);
  }, []);

  const notify = useCallback((text: string, ok: boolean) => {
    setInjectMsg({ text, ok });
    setTimeout(() => setInjectMsg(null), 4000);
  }, []);

  const handleApplyPreset = async () => {
    setPresetSaving(true);
    try {
      await api.setPreset(selectedPreset);
      notify("Preset updated to " + selectedPreset, true);
      setSimStatus(s => s ? { ...s, timingPreset: selectedPreset } : s);
    } catch {
      notify("Failed to update preset", false);
    }
    setPresetSaving(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="section-title !mb-0">Admin</h2>
        <div className="flex items-center gap-4">
          <Link to="/admin/analytics" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Analytics &rarr;</Link>
          <Link to="/admin/costs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">AI Model Costs &rarr;</Link>
        </div>
      </div>

      {injectMsg && (
        <div className={cn(
          "text-sm mb-4 px-3 py-2 rounded",
          injectMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
        )}>
          {injectMsg.text}
        </div>
      )}

      <PresetSelector
        currentPreset={simStatus?.timingPreset}
        selectedPreset={selectedPreset}
        onSelect={setSelectedPreset}
        onApply={handleApplyPreset}
        saving={presetSaving}
      />

      <InjectForms onInjected={notify} />

      <ModelConfig />

      <ActionsReference />
    </div>
  );
}
