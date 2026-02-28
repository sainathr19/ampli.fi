import { Router, Request, Response } from "express";
import { getPrivyClient } from "../lib/privyClient.js";

const router = Router();

/**
 * POST /api/wallet/starknet
 * Creates a Starknet wallet via Privy.
 * Request: optional Authorization: Bearer <privy_access_token>
 * Response: { wallet: { id, address, publicKey } }
 */
router.post("/starknet", async (req: Request, res: Response) => {
  try {
    const privy = getPrivyClient();
    const wallet = await privy.wallets().create({ chain_type: "starknet" });
    const result = {
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.public_key,
    };
    return res.status(200).json({ wallet: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create wallet";
    console.error("Error creating wallet:", msg);
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/wallet/sign
 * Signs a hash with the Privy wallet.
 * Request: { walletId: string, hash: string }
 * Response: { signature: string }
 */
router.post("/sign", async (req: Request, res: Response) => {
  try {
    const { walletId, hash } = (req.body || {}) as { walletId?: string; hash?: string };
    if (!walletId || !hash) {
      return res.status(400).json({ error: "walletId and hash are required" });
    }
    const privy = getPrivyClient();
    const result = await privy.wallets().rawSign(walletId, { params: { hash } });
    return res.status(200).json({ signature: result.signature });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to sign";
    console.error("Error signing:", msg);
    return res.status(500).json({ error: msg });
  }
});

export default router;
