import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { settings } from "../lib/settings.js";

const LOG_PREFIX = "[migrate]";

function log(msg: string): void {
  console.log(`${LOG_PREFIX} ${msg}`);
}

function logError(msg: string, err?: unknown): void {
  console.error(`${LOG_PREFIX} ${msg}`, err ?? "");
}

export async function runMigrations(): Promise<void> {
  log("Starting database migrations...");

  const pool = new Pool({ connectionString: settings.database_url });

  try {
    const projectRoot = process.cwd();
    const candidates = [
      path.join(projectRoot, "src/db/migrations"),
      path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations"),
    ];
    const migrationsDir = candidates.find((d) => fs.existsSync(d));
    if (!migrationsDir) {
      logError("Migrations directory not found. Tried: " + candidates.join(", "));
      throw new Error("Migrations directory not found");
    }
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

    if (files.length === 0) {
      log("No migration files found");
      return;
    }

    for (const file of files.sort()) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      log(`Running ${file}...`);
      try {
        await pool.query(sql);
        log(`  ✓ ${file} completed`);
      } catch (err) {
        logError(`  ✗ ${file} failed`, err);
        throw err;
      }
    }

    log("Migrations completed successfully");
  } finally {
    await pool.end();
  }
}
