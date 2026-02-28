import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { settings } from "../settings.js";
import {
  BridgeActionStatus,
  BridgeActionType,
  BridgeCreateOrderInput,
  BridgeOrder,
  BridgeOrderPage,
  BridgeOrderStatus,
} from "./types.js";

type BridgeOrderRow = {
  id: string;
  network: string;
  source_asset: string;
  destination_asset: string;
  amount: string;
  amount_type: string;
  receive_address: string;
  wallet_address: string;
  status: string;
  atomiq_swap_id: string | null;
  source_tx_id: string | null;
  destination_tx_id: string | null;
  quote_json: Record<string, unknown> | null;
  expires_at: Date | null;
  last_error: string | null;
  raw_state_json: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateBridgeOrderArgs = {
  input: BridgeCreateOrderInput;
  status: BridgeOrderStatus;
  atomiqSwapId?: string | null;
  quote?: Record<string, unknown> | null;
  expiresAt?: string | null;
  rawState?: Record<string, unknown> | null;
};

export type BridgeRepository = {
  init(): Promise<void>;
  createOrder(args: CreateBridgeOrderArgs): Promise<BridgeOrder>;
  getOrderById(id: string): Promise<BridgeOrder | null>;
  listOrdersByWallet(walletAddress: string, page: number, limit: number): Promise<BridgeOrderPage>;
  updateOrder(
    id: string,
    patch: Partial<{
      status: BridgeOrderStatus;
      sourceTxId: string | null;
      destinationTxId: string | null;
      lastError: string | null;
      rawState: Record<string, unknown> | null;
      quote: Record<string, unknown> | null;
      atomiqSwapId: string | null;
      expiresAt: string | null;
    }>
  ): Promise<BridgeOrder>;
  addAction(
    orderId: string,
    type: BridgeActionType,
    status: BridgeActionStatus,
    payload?: Record<string, unknown>
  ): Promise<void>;
  addEvent(
    orderId: string,
    type: string,
    fromStatus: BridgeOrderStatus | null,
    toStatus: BridgeOrderStatus | null,
    payload?: Record<string, unknown>
  ): Promise<void>;
  getActiveOrders(limit?: number): Promise<BridgeOrder[]>;
};

function toOrder(row: BridgeOrderRow): BridgeOrder {
  return {
    id: row.id,
    network: row.network as BridgeOrder["network"],
    sourceAsset: row.source_asset as "BTC",
    destinationAsset: row.destination_asset,
    amount: row.amount,
    amountType: row.amount_type as BridgeOrder["amountType"],
    receiveAddress: row.receive_address,
    walletAddress: row.wallet_address,
    status: row.status as BridgeOrderStatus,
    atomiqSwapId: row.atomiq_swap_id,
    sourceTxId: row.source_tx_id,
    destinationTxId: row.destination_tx_id,
    quote: row.quote_json,
    expiresAt: row.expires_at?.toISOString() ?? null,
    lastError: row.last_error,
    rawState: row.raw_state_json,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PgBridgeRepository implements BridgeRepository {
  constructor(private readonly pool: Pool) {}

  static fromSettings(): PgBridgeRepository {
    return new PgBridgeRepository(new Pool({ connectionString: settings.database_url }));
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bridge_orders (
        id UUID PRIMARY KEY,
        network TEXT NOT NULL,
        source_asset TEXT NOT NULL,
        destination_asset TEXT NOT NULL,
        amount NUMERIC(78,0) NOT NULL,
        amount_type TEXT NOT NULL,
        receive_address TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        status TEXT NOT NULL,
        atomiq_swap_id TEXT UNIQUE,
        source_tx_id TEXT,
        destination_tx_id TEXT,
        quote_json JSONB,
        expires_at TIMESTAMPTZ,
        last_error TEXT,
        raw_state_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bridge_actions (
        id BIGSERIAL PRIMARY KEY,
        order_id UUID NOT NULL REFERENCES bridge_orders(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL,
        action_status TEXT NOT NULL,
        payload_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bridge_events (
        id BIGSERIAL PRIMARY KEY,
        order_id UUID NOT NULL REFERENCES bridge_orders(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        payload_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_bridge_orders_wallet_created ON bridge_orders(wallet_address, created_at DESC);"
    );
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_bridge_orders_status_updated ON bridge_orders(status, updated_at DESC);"
    );
  }

  async createOrder(args: CreateBridgeOrderArgs): Promise<BridgeOrder> {
    const id = randomUUID();
    const result = await this.pool.query<BridgeOrderRow>(
      `
      INSERT INTO bridge_orders (
        id, network, source_asset, destination_asset, amount, amount_type, receive_address, wallet_address, status,
        atomiq_swap_id, quote_json, expires_at, raw_state_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
      `,
      [
        id,
        args.input.network,
        args.input.sourceAsset,
        args.input.destinationAsset,
        args.input.amount,
        args.input.amountType,
        args.input.receiveAddress,
        args.input.walletAddress,
        args.status,
        args.atomiqSwapId ?? null,
        args.quote ?? null,
        args.expiresAt ?? null,
        args.rawState ?? null,
      ]
    );
    return toOrder(result.rows[0]);
  }

  async getOrderById(id: string): Promise<BridgeOrder | null> {
    const result = await this.pool.query<BridgeOrderRow>("SELECT * FROM bridge_orders WHERE id = $1 LIMIT 1", [id]);
    return result.rowCount ? toOrder(result.rows[0]) : null;
  }

  async listOrdersByWallet(walletAddress: string, page: number, limit: number): Promise<BridgeOrderPage> {
    const offset = (page - 1) * limit;
    const [countResult, rowsResult] = await Promise.all([
      this.pool.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM bridge_orders WHERE wallet_address = $1", [
        walletAddress,
      ]),
      this.pool.query<BridgeOrderRow>(
        "SELECT * FROM bridge_orders WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        [walletAddress, limit, offset]
      ),
    ]);

    const total = Number(countResult.rows[0]?.total ?? "0");
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: rowsResult.rows.map(toOrder),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async updateOrder(
    id: string,
    patch: Partial<{
      status: BridgeOrderStatus;
      sourceTxId: string | null;
      destinationTxId: string | null;
      lastError: string | null;
      rawState: Record<string, unknown> | null;
      quote: Record<string, unknown> | null;
      atomiqSwapId: string | null;
      expiresAt: string | null;
    }>
  ): Promise<BridgeOrder> {
    const current = await this.getOrderById(id);
    if (!current) {
      throw new Error("Bridge order not found");
    }

    const next = {
      status: patch.status ?? current.status,
      sourceTxId: patch.sourceTxId ?? current.sourceTxId,
      destinationTxId: patch.destinationTxId ?? current.destinationTxId,
      lastError: patch.lastError ?? current.lastError,
      rawState: patch.rawState ?? current.rawState,
      quote: patch.quote ?? current.quote,
      atomiqSwapId: patch.atomiqSwapId ?? current.atomiqSwapId,
      expiresAt: patch.expiresAt ?? current.expiresAt,
    };

    const result = await this.pool.query<BridgeOrderRow>(
      `
      UPDATE bridge_orders
      SET
        status = $2,
        source_tx_id = $3,
        destination_tx_id = $4,
        last_error = $5,
        raw_state_json = $6,
        quote_json = $7,
        atomiq_swap_id = $8,
        expires_at = $9,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        next.status,
        next.sourceTxId,
        next.destinationTxId,
        next.lastError,
        next.rawState,
        next.quote,
        next.atomiqSwapId,
        next.expiresAt,
      ]
    );

    return toOrder(result.rows[0]);
  }

  async addAction(
    orderId: string,
    type: BridgeActionType,
    status: BridgeActionStatus,
    payload?: Record<string, unknown>
  ): Promise<void> {
    await this.pool.query(
      "INSERT INTO bridge_actions(order_id, action_type, action_status, payload_json) VALUES ($1, $2, $3, $4)",
      [orderId, type, status, payload ?? null]
    );
  }

  async addEvent(
    orderId: string,
    type: string,
    fromStatus: BridgeOrderStatus | null,
    toStatus: BridgeOrderStatus | null,
    payload?: Record<string, unknown>
  ): Promise<void> {
    await this.pool.query(
      "INSERT INTO bridge_events(order_id, event_type, from_status, to_status, payload_json) VALUES ($1, $2, $3, $4, $5)",
      [orderId, type, fromStatus, toStatus, payload ?? null]
    );
  }

  async getActiveOrders(limit = 50): Promise<BridgeOrder[]> {
    const result = await this.pool.query<BridgeOrderRow>(
      `
      SELECT * FROM bridge_orders
      WHERE status IN ('CREATED', 'AWAITING_USER_SIGNATURE', 'SOURCE_SUBMITTED', 'SOURCE_CONFIRMED', 'CLAIMING', 'REFUNDING')
      ORDER BY updated_at ASC
      LIMIT $1
      `,
      [limit]
    );
    return result.rows.map(toOrder);
  }
}
