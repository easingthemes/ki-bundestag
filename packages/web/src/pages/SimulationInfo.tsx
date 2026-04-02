import { ModelConfig } from "@/components/admin/ModelConfig";
import { ActionsReference } from "@/components/admin/ActionsReference";
import { SimulationCosts } from "./SimulationCosts";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

export function SimulationInfo() {
  usePageMeta(ROUTE_SEO["/simulation-info"] ?? { title: "Simulation" });
  return (
    <div>
      <h2 className="section-title">Über die Simulation</h2>
      <ModelConfig />
      <ActionsReference />
      <SimulationCosts />
    </div>
  );
}
