/**
 * In-memory storage for Atomiq SDK when running in Node.js (no window/indexedDB).
 * Implements the same interface as IndexedDBUnifiedStorage for swap persistence.
 */

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

export class InMemoryUnifiedStorage {
  private store = new Map<string, Record<string, unknown>>();
  private initialized = false;

  constructor(_storageKey: string) {
    // storageKey ignored for in-memory
  }

  async init(_indexes?: unknown, _compositeIndexes?: unknown): Promise<void> {
    this.initialized = true;
  }

  async query(params: QueryParam[][]): Promise<Record<string, unknown>[]> {
    if (!this.initialized) {
      throw new Error("Not initiated, call init() first!");
    }
    if (params.length === 0) {
      return Array.from(this.store.values());
    }
    const allObjects = Array.from(this.store.values());
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
    if (id != null) {
      this.store.set(id, { ...object });
    }
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
    if (id != null) {
      this.store.delete(id);
    }
  }

  async removeAll(arr: Record<string, unknown>[]): Promise<void> {
    if (arr.length === 0) return;
    for (const object of arr) {
      await this.remove(object);
    }
  }
}

/**
 * In-memory storage manager for chain data (headers, etc.) when running in Node.js.
 * Implements the same interface as LocalStorageManager.
 */
export class InMemoryChainStorage {
  rawData: Record<string, unknown> = {};
  data: Record<string, unknown> = {};
  storageKey: string;

  constructor(storageKey: string) {
    this.storageKey = storageKey;
  }

  async init(): Promise<void> {
    this.rawData = {};
  }

  saveData(hash: string, object: { serialize: () => unknown }): Promise<void> {
    this.data[hash] = object;
    this.rawData[hash] = object.serialize();
    return Promise.resolve();
  }

  saveDataArr(arr: { id: string; object: { serialize: () => unknown } }[]): Promise<void> {
    for (const e of arr) {
      this.data[e.id] = e.object;
      this.rawData[e.id] = e.object.serialize();
    }
    return Promise.resolve();
  }

  removeData(hash: string): Promise<void> {
    if (this.rawData[hash] != null) {
      delete this.data[hash];
      delete this.rawData[hash];
    }
    return Promise.resolve();
  }

  removeDataArr(hashArr: string[]): Promise<void> {
    for (const hash of hashArr) {
      if (this.rawData[hash] != null) {
        delete this.data[hash];
        delete this.rawData[hash];
      }
    }
    return Promise.resolve();
  }

  loadData<T>(type: new (raw: unknown) => T): Promise<T[]> {
    return Promise.resolve(
      Object.keys(this.rawData).map((e) => {
        const deserialized = new type(this.rawData[e]);
        this.data[e] = deserialized;
        return deserialized;
      })
    );
  }
}
