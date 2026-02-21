import "dotenv/config";
import fs from "node:fs";
import { getDbPath, getUserDbPath } from "./db/connection.js";
import { seedDatabase } from "./db/index.js";
import { closeDb } from "./db/connection.js";

// Always back up existing DBs before seeding
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

const dbPath = getDbPath();
if (fs.existsSync(dbPath)) {
  const backupPath = `${dbPath}.backup-${timestamp}`;
  fs.copyFileSync(dbPath, backupPath);
  if (fs.existsSync(`${dbPath}-wal`)) {
    fs.copyFileSync(`${dbPath}-wal`, `${backupPath}-wal`);
  }
  console.log(`Backed up simulation.db to ${backupPath}`);
}

const userDbPath = getUserDbPath();
if (fs.existsSync(userDbPath)) {
  const backupPath = `${userDbPath}.backup-${timestamp}`;
  fs.copyFileSync(userDbPath, backupPath);
  if (fs.existsSync(`${userDbPath}-wal`)) {
    fs.copyFileSync(`${userDbPath}-wal`, `${backupPath}-wal`);
  }
  console.log(`Backed up users.db to ${backupPath}`);
}

console.log("Seeding database...");
seedDatabase();
closeDb();
console.log("Done!");
