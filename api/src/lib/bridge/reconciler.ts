import { log } from "../logger.js";
import { settings } from "../settings.js";
import { BridgeOrder, BridgeOrderStatus } from "./types.js";
import { BridgeRepository } from "./repository.js";
import { BridgeService } from "./bridgeService.js";
import { RpcProvider, hash as starknetHash } from "starknet";

const POLL_INTERVAL_MS = 15_000;
const STALE_ORDER_HOURS = 24;
const BTC_CONFIRMATIONS_REQUIRED = 1;
const CLAIMING_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour fallback

const MEMPOOL_BASE =
  settings.network === "mainnet"
    ? "https://mempool.space/api/"
    : "https://mempool.space/testnet4/api/";

// SPV Vault contract addresses (from @atomiqlabs/chain-starknet)
const SPV_VAULT_ADDRESS =
  settings.network === "mainnet"
    ? "0x01932042992647771f3d0aa6ee526e65359c891fe05a285faaf4d3ffa373e132"
    : "0x02d581ea838cd5ca46ba08660eddd064d50a0392f618e95310432147928d572e";

// Event name hashes for filtering (hex-encoded)
const toHex = (n: bigint) => "0x" + n.toString(16);
const FRONTED_KEY = toHex(starknetHash.starknetKeccak("Fronted"));
const CLAIMED_KEY = toHex(starknetHash.starknetKeccak("Claimed"));
const CLOSED_KEY = toHex(starknetHash.starknetKeccak("Closed"));

const PENDING_STATUSES: BridgeOrderStatus[] = [
  "CREATED",
  "SWAP_CREATED",
  "BTC_SENT",
  "BTC_CONFIRMED",
  "CLAIMING",
];

// ---------------------------------------------------------------------------
// Mempool helpers
// ---------------------------------------------------------------------------

type MempoolTxStatus = {
  confirmed: boolean;
  block_height?: number;
};

async function getMempoolTx(
  txid: string
): Promise<{ status: MempoolTxStatus } | null> {
  try {
    const res = await fetch(`${MEMPOOL_BASE}tx/${txid}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { status: MempoolTxStatus };
  } catch {
    return null;
  }
}

async function getTipHeight(): Promise<number | null> {
  try {
    const res = await fetch(`${MEMPOOL_BASE}blocks/tip/height`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const n = Number(await res.text());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Starknet SPV vault event checker
// ---------------------------------------------------------------------------

type SwapSettlementResult =
  | { settled: true; type: "fronted" | "claimed"; txHash: string }
  | { settled: false; type?: "closed"; error?: string };

function btcTxIdToU256Keys(btcTxId: string): { low: string; high: string } {
  // Reverse the BTC tx hash bytes (little-endian → big-endian), convert to uint256
  const reversed = Buffer.from(btcTxId, "hex").reverse();
  const fullHex = reversed.toString("hex").padStart(64, "0");
  // uint256 = { low: lower 128 bits, high: upper 128 bits }
  const high = "0x" + fullHex.slice(0, 32);
  const low = "0x" + fullHex.slice(32);
  return { low, high };
}

async function checkSwapSettled(
  provider: RpcProvider,
  btcTxId: string
): Promise<SwapSettlementResult> {
  try {
    const { low, high } = btcTxIdToU256Keys(btcTxId);
    const response = await provider.getEvents({
      address: SPV_VAULT_ADDRESS,
      keys: [[FRONTED_KEY, CLAIMED_KEY, CLOSED_KEY], [low], [high]],
      to_block: "latest" as never,
      chunk_size: 10,
    });

    for (const event of response.events) {
      const eventKey = event.keys[0];
      if (eventKey === CLAIMED_KEY) {
        return { settled: true, type: "claimed", txHash: event.transaction_hash };
      }
      if (eventKey === FRONTED_KEY) {
        return { settled: true, type: "fronted", txHash: event.transaction_hash };
      }
      if (eventKey === CLOSED_KEY) {
        return { settled: false, type: "closed", error: "vault closed" };
      }
    }

    return { settled: false };
  } catch (err) {
    log.warn("reconciler: starknet event check failed", {
      btcTxId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { settled: false };
  }
}

// ---------------------------------------------------------------------------
// Reconciler
// ---------------------------------------------------------------------------

export class OrderReconciler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly starknetProvider: RpcProvider;

  constructor(
    private readonly repository: BridgeRepository,
    private readonly service: BridgeService
  ) {
    this.starknetProvider = new RpcProvider({ nodeUrl: settings.rpc_url });
  }

  start(): void {
    if (this.timer) return;
    log.info("order reconciler started", { intervalMs: POLL_INTERVAL_MS });
    this.tick();
    this.timer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcile();
    } catch (err) {
      log.error("reconciler tick error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.running = false;
    }
  }

  private async reconcile(): Promise<void> {
    const orders = await this.repository.listPendingOrders(PENDING_STATUSES);
    if (orders.length === 0) return;

    const tipHeight = await getTipHeight();

    for (const order of orders) {
      try {
        await this.reconcileOrder(order, tipHeight);
      } catch (err) {
        log.warn("reconciler: order failed", {
          orderId: order.id,
          status: order.status,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async reconcileOrder(
    order: BridgeOrder,
    tipHeight: number | null
  ): Promise<void> {
    const ageMs = Date.now() - new Date(order.createdAt).getTime();
    const sinceUpdateMs = Date.now() - new Date(order.updatedAt).getTime();

    switch (order.status) {
      // ----- Expire stale pre-BTC orders -----
      case "CREATED":
      case "SWAP_CREATED": {
        if (ageMs > STALE_ORDER_HOURS * 3600_000) {
          log.info("reconciler: expiring stale order", {
            orderId: order.id,
            status: order.status,
          });
          await this.service.updateStatus(order.id, "EXPIRED");
        }
        break;
      }

      // ----- Check BTC tx confirmations -----
      case "BTC_SENT": {
        if (!order.sourceTxId) break;

        const tx = await getMempoolTx(order.sourceTxId);
        if (!tx || !tx.status.confirmed) break;

        if (
          tipHeight != null &&
          tx.status.block_height != null &&
          tipHeight - tx.status.block_height + 1 < BTC_CONFIRMATIONS_REQUIRED
        ) {
          break;
        }

        log.info("reconciler: BTC confirmed", {
          orderId: order.id,
          txid: order.sourceTxId,
        });
        await this.service.updateStatus(order.id, "BTC_CONFIRMED");
        break;
      }

      // ----- Check if already claimed on Starknet, else advance to CLAIMING -----
      case "BTC_CONFIRMED": {
        if (!order.sourceTxId) {
          await this.service.updateStatus(order.id, "CLAIMING");
          break;
        }
        // Check Starknet contract events to see if already settled
        const confirmedResult = await checkSwapSettled(this.starknetProvider, order.sourceTxId);
        if (confirmedResult.settled) {
          log.info("reconciler: BTC_CONFIRMED → already SETTLED on Starknet", {
            orderId: order.id,
            claimType: confirmedResult.type,
            starknetTx: confirmedResult.txHash,
          });
          await this.service.updateStatus(order.id, "SETTLED", {
            destinationTxId: confirmedResult.txHash,
          });
        } else {
          log.info("reconciler: advancing to CLAIMING", { orderId: order.id });
          await this.service.updateStatus(order.id, "CLAIMING");
        }
        break;
      }

      // ----- Check Starknet for claim events, fallback to timeout -----
      case "CLAIMING": {
        if (order.sourceTxId) {
          const result = await checkSwapSettled(this.starknetProvider, order.sourceTxId);
          if (result.settled) {
            log.info("reconciler: swap settled on Starknet", {
              orderId: order.id,
              claimType: result.type,
              starknetTx: result.txHash,
            });
            await this.service.updateStatus(order.id, "SETTLED", {
              destinationTxId: result.txHash,
            });
            break;
          }
          if (result.type === "closed") {
            log.warn("reconciler: vault closed for order", {
              orderId: order.id,
            });
            await this.service.updateStatus(order.id, "FAILED", {
              lastError: "SPV vault closed",
            });
            break;
          }
        }
        // Fallback: if stuck in CLAIMING for too long, mark SETTLED optimistically
        if (sinceUpdateMs > CLAIMING_TIMEOUT_MS) {
          log.info("reconciler: CLAIMING timeout, marking SETTLED", {
            orderId: order.id,
            claimingMinutes: Math.round(sinceUpdateMs / 60_000),
          });
          await this.service.updateStatus(order.id, "SETTLED");
        }
        break;
      }
    }
  }
}
