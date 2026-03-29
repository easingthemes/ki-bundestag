import "dotenv/config";
import { migrateDatabase } from "./db/index.js";
import { closeDb } from "./db/connection.js";

console.log("[DB] Running migrations...");
migrateDatabase();
closeDb();
console.log("[DB] Schema up to date. Existing data preserved.");
