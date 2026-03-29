import { ModelConfig } from "@/components/admin/ModelConfig";
import { ActionsReference } from "@/components/admin/ActionsReference";
import { SimulationCosts } from "./SimulationCosts";

export function SimulationInfo() {
  return (
    <div>
      <h2 className="section-title">Über die Simulation</h2>
      <ModelConfig />
      <ActionsReference />
      <SimulationCosts />
    </div>
  );
}
