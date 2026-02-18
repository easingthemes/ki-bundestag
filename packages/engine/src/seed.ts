import "dotenv/config";
import fs from "node:fs";
import { getDbPath } from "./db/connection.js";
import { seedDatabase } from "./db/index.js";
import { closeDb } from "./db/connection.js";

// Always back up existing DB before seeding
const dbPath = getDbPath();
if (fs.existsSync(dbPath)) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${dbPath}.backup-${timestamp}`;
  fs.copyFileSync(dbPath, backupPath);
  // Also back up WAL file if it exists
  if (fs.existsSync(`${dbPath}-wal`)) {
    fs.copyFileSync(`${dbPath}-wal`, `${backupPath}-wal`);
  }
  console.log(`Backed up existing database to ${backupPath}`);
}

console.log("Seeding database...");
seedDatabase();
closeDb();
console.log("Done!");
