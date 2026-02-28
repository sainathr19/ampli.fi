import { PrivyClient } from "@privy-io/node";
import { settings } from "./settings.js";

let client: PrivyClient | undefined;

export function getPrivyClient(): PrivyClient {
  if (client) return client;
  const appId = settings.privy_app_id;
  const appSecret = settings.privy_app_secret;
  client = new PrivyClient({ appId, appSecret });
  return client;
}
