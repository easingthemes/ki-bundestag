import "dotenv/config";
import { migrateDatabase } from "./db/index.js";
import { closeDb } from "./db/connection.js";

console.log("Running migrations...");
migrateDatabase();
closeDb();
console.log("Schema up to date. Existing data preserved.");
