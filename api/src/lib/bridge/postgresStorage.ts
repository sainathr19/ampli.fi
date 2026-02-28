/**
 * PostgreSQL-backed storage for Atomiq SDK swap persistence.
 * Survives server restarts; uses the same database as bridge_orders.
 */

import { Pool } from "pg";
import { settings } from "../settings.js";

let sharedPool: Pool | null = null;

function getPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({ connectionString: settings.database_url });
  }
  return sharedPool;
}

type QueryParam = { key: string; value: unknown | unknown[] };

function toSetConditions(params: QueryParam[]): { key: string; values: Set<unknown> }[] {
  return params.map((param) => ({
    key: param.key,
    values: Array.isArray(param.value) ? new Set(param.value) : new Set([param.value]),
  }));
}

function matches(
  conditions: { key: string; values: Set<unknown> }[],
  obj: Record<string, unknown>
): boolean {
  for (const condition of conditions) {
    const value = obj[condition.key];
    if (!condition.values.has(value)) return false;
  }
  return true;
}

const TABLE_NAME = "atomiq_swaps";

async function ensureTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      storage_key TEXT NOT NULL,
      id TEXT NOT NULL,
      data JSONB NOT NULL,
      PRIMARY KEY (storage_key, id)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_atomiq_swaps_storage_key ON ${TABLE_NAME}(storage_key)`
  );
}

export class PostgresUnifiedStorage {
  private readonly pool: Pool;
  private readonly storageKey: string;
  private initialized = false;

  constructor(storageKey: string, pool?: Pool) {
    this.storageKey = storageKey;
    this.pool = pool ?? getPool();
  }

  async init(_indexes?: unknown, _compositeIndexes?: unknown): Promise<void> {
    await ensureTable(this.pool);
    this.initialized = true;
  }

  async query(params: QueryParam[][]): Promise<Record<string, unknown>[]> {
    if (!this.initialized) {
      throw new Error("Not initiated, call init() first!");
    }
    const result = await this.pool.query<{ data: Record<string, unknown> }>(
      `SELECT data FROM ${TABLE_NAME} WHERE storage_key = $1`,
      [this.storageKey]
    );
    const allObjects = result.rows.map((r) => r.data);

    if (params.length === 0) {
      return allObjects;
    }

    const resultSet = new Set<Record<string, unknown>>();
    for (const singleParam of params) {
      const filtered = allObjects.filter((obj) => matches(toSetConditions(singleParam), obj));
      filtered.forEach((obj) => resultSet.add(obj));
    }
    return Array.from(resultSet);
  }

  async save(object: Record<string, unknown>): Promise<void> {
    if (!this.initialized) {
      throw new Error("Not initiated, call init() first!");
    }
    const id = object.id as string;
    if (id == null) return;

    await this.pool.query(
      `
      INSERT INTO ${TABLE_NAME} (storage_key, id, data)
      VALUES ($1, $2, $3)
      ON CONFLICT (storage_key, id) DO UPDATE SET data = EXCLUDED.data
      `,
      [this.storageKey, id, JSON.stringify(object)]
    );
  }

  async saveAll(arr: Record<string, unknown>[]): Promise<void> {
    if (arr.length === 0) return;
    for (const object of arr) {
      await this.save(object);
    }
  }

  async remove(object: Record<string, unknown>): Promise<void> {
    if (!this.initialized) {
      throw new Error("Not initiated, call init() first!");
    }
    const id = object.id as string;
    if (id == null) return;

    await this.pool.query(
      `DELETE FROM ${TABLE_NAME} WHERE storage_key = $1 AND id = $2`,
      [this.storageKey, id]
    );
  }

  async removeAll(arr: Record<string, unknown>[]): Promise<void> {
    if (arr.length === 0) return;
    for (const object of arr) {
      await this.remove(object);
    }
  }
}
