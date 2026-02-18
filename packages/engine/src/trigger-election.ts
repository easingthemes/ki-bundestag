import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb, schema, closeDb } from "./db/index.js";

const db = getDb();
const meta = db.select().from(schema.simulationMeta).all()[0];
if (!meta) {
  console.error("No simulation meta found. Run seed first.");
  process.exit(1);
}

db.update(schema.simulationMeta)
  .set({ nextElectionDay: meta.currentDay })
  .where(eq(schema.simulationMeta.id, meta.id))
  .run();

console.log(`Set nextElectionDay to ${meta.currentDay} (current day). Next 'npm run simulate' will trigger an election.`);
closeDb();
