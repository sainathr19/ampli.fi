import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { settings } from "../settings.js";
import { log } from "../logger.js";
import {
  BridgeCreateOrderInput,
  BridgeOrder,
  BridgeOrderAction,
  BridgeOrderPage,
  BridgeOrderStatus,
  DepositParams,
} from "./types.js";

type BridgeOrderRow = {
  id: string;
  network: string;
  source_asset: string;
  destination_asset: string;
  amount: string;
  amount_type: string;
  amount_source: string | null;
  amount_destination: string | null;
  deposit_address: string | null;
  receive_address: string;
  wallet_address: string;
  bitcoin_address: string | null;
  status: string;
  action: string;
  atomiq_swap_id: string | null;
  source_tx_id: string | null;
  destination_tx_id: string | null;
  last_error: string | null;
  deposit_params: unknown | null;
  supply_tx_id: string | null;
  borrow_tx_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type BridgeRepository = {
  init(): Promise<void>;
  createOrder(input: BridgeCreateOrderInput): Promise<BridgeOrder>;
  getOrderById(id: string): Promise<BridgeOrder | null>;
  listPendingOrders(statuses: BridgeOrderStatus[]): Promise<BridgeOrder[]>;
  listOrdersByWallet(walletAddress: string, page: number, limit: number, action?: BridgeOrderAction): Promise<BridgeOrderPage>;
  updateOrder(
    id: string,
    patch: Partial<{
      status: BridgeOrderStatus;
      atomiqSwapId: string | null;
      sourceTxId: string | null;
      destinationTxId: string | null;
      lastError: string | null;
      amountSource: string | null;
      amountDestination: string | null;
      depositAddress: string | null;
      supplyTxId: string | null;
      borrowTxId: string | null;
    }>
  ): Promise<BridgeOrder>;
};

function toOrder(row: BridgeOrderRow): BridgeOrder {
  return {
    id: row.id,
    network: row.network as BridgeOrder["network"],
    sourceAsset: row.source_asset as "BTC",
    destinationAsset: row.destination_asset,
    amount: row.amount,
    amountType: row.amount_type as BridgeOrder["amountType"],
    amountSource: row.amount_source,
    amountDestination: row.amount_destination,
    depositAddress: row.deposit_address,
    receiveAddress: row.receive_address,
    walletAddress: row.wallet_address,
    bitcoinAddress: row.bitcoin_address,
    status: row.status as BridgeOrderStatus,
    action: (row.action ?? "swap") as BridgeOrder["action"],
    atomiqSwapId: row.atomiq_swap_id,
    sourceTxId: row.source_tx_id,
    destinationTxId: row.destination_tx_id,
    lastError: row.last_error,
    depositParams: row.deposit_params ? (row.deposit_params as DepositParams) : null,
    supplyTxId: row.supply_tx_id,
    borrowTxId: row.borrow_tx_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PgBridgeRepository implements BridgeRepository {
  constructor(private readonly pool: Pool) {
    if (typeof this.pool.on === "function") {
      this.pool.on("error", (error: Error) => {
        log.error("bridge repository postgres pool error", {
          error: error.message,
        });
      });
    }
  }

  static fromSettings(): PgBridgeRepository {
    return new PgBridgeRepository(new Pool({ connectionString: settings.database_url }));
  }

  async init(): Promise<void> {
    log.info("bridge repository initialized");
  }

  async createOrder(input: BridgeCreateOrderInput): Promise<BridgeOrder> {
    const id = randomUUID();
    const result = await this.pool.query<BridgeOrderRow>(
      `
      INSERT INTO bridge_orders (
        id, network, source_asset, destination_asset, amount, amount_type,
        receive_address, wallet_address, bitcoin_address, status, action, deposit_params
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
      `,
      [
        id,
        input.network,
        input.sourceAsset,
        input.destinationAsset,
        input.amount,
        input.amountType,
        input.receiveAddress,
        input.walletAddress,
        input.bitcoinAddress,
        "CREATED",
        input.action,
        input.depositParams ? JSON.stringify(input.depositParams) : null,
      ]
    );
    return toOrder(result.rows[0]);
  }

  async getOrderById(id: string): Promise<BridgeOrder | null> {
    const result = await this.pool.query<BridgeOrderRow>("SELECT * FROM bridge_orders WHERE id = $1 LIMIT 1", [id]);
    return result.rowCount ? toOrder(result.rows[0]) : null;
  }

  async listPendingOrders(statuses: BridgeOrderStatus[]): Promise<BridgeOrder[]> {
    if (statuses.length === 0) return [];
    const placeholders = statuses.map((_, i) => `$${i + 1}`).join(", ");
    const result = await this.pool.query<BridgeOrderRow>(
      `SELECT * FROM bridge_orders WHERE status IN (${placeholders}) ORDER BY updated_at ASC LIMIT 100`,
      statuses
    );
    return result.rows.map(toOrder);
  }

  async listOrdersByWallet(walletAddress: string, page: number, limit: number, action?: BridgeOrderAction): Promise<BridgeOrderPage> {
    const offset = (page - 1) * limit;
    const walletCondition = "(wallet_address = $1 OR bitcoin_address = $1)";
    const condition = action
      ? `${walletCondition} AND action = $2`
      : walletCondition;
    const params = action ? [walletAddress, action] : [walletAddress];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const [countResult, rowsResult] = await Promise.all([
      this.pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM bridge_orders WHERE ${condition}`, params),
      this.pool.query<BridgeOrderRow>(
        `SELECT * FROM bridge_orders WHERE ${condition} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, limit, offset]
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
      atomiqSwapId: string | null;
      sourceTxId: string | null;
      destinationTxId: string | null;
      lastError: string | null;
      amountSource: string | null;
      amountDestination: string | null;
      depositAddress: string | null;
      supplyTxId: string | null;
      borrowTxId: string | null;
    }>
  ): Promise<BridgeOrder> {
    const current = await this.getOrderById(id);
    if (!current) {
      throw new Error("Bridge order not found");
    }

    const next = {
      status: patch.status ?? current.status,
      atomiqSwapId: patch.atomiqSwapId ?? current.atomiqSwapId,
      sourceTxId: patch.sourceTxId ?? current.sourceTxId,
      destinationTxId: patch.destinationTxId ?? current.destinationTxId,
      lastError: patch.lastError ?? current.lastError,
      amountSource: patch.amountSource ?? current.amountSource,
      amountDestination: patch.amountDestination ?? current.amountDestination,
      depositAddress: patch.depositAddress ?? current.depositAddress,
      supplyTxId: patch.supplyTxId ?? current.supplyTxId,
      borrowTxId: patch.borrowTxId ?? current.borrowTxId,
    };

    const result = await this.pool.query<BridgeOrderRow>(
      `
      UPDATE bridge_orders
      SET
        status = $2,
        atomiq_swap_id = $3,
        source_tx_id = $4,
        destination_tx_id = $5,
        last_error = $6,
        amount_source = $7,
        amount_destination = $8,
        deposit_address = $9,
        supply_tx_id = $10,
        borrow_tx_id = $11,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        next.status,
        next.atomiqSwapId,
        next.sourceTxId,
        next.destinationTxId,
        next.lastError,
        next.amountSource,
        next.amountDestination,
        next.depositAddress,
        next.supplyTxId,
        next.borrowTxId,
      ]
    );

    return toOrder(result.rows[0]);
  }
}
