import { BridgeOrderStatus } from "./types.js";

export function mapAtomiqStateToOrderStatus(rawState: unknown): BridgeOrderStatus {
  const value = String(rawState ?? "").toUpperCase();

  if (value.includes("CLAIMED") || value.includes("SETTLED") || value.includes("SUCCESS")) {
    return "SETTLED";
  }
  if (value.includes("BTC_TX_CONFIRMED") || value.includes("CONFIRMED")) {
    return "SOURCE_CONFIRMED";
  }
  if (value.includes("COMMIT") || value.includes("SUBMIT") || value.includes("PENDING")) {
    return "SOURCE_SUBMITTED";
  }
  if (value.includes("EXPIRE")) {
    return "EXPIRED";
  }
  if (value.includes("REFUND")) {
    return "REFUNDED";
  }
  if (value.includes("FAIL")) {
    return "FAILED";
  }

  return "CREATED";
}
