import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "@iarna/toml";
import { z } from "zod";

const DEFAULT_SETTINGS_FILE = "Settings.toml";

const SettingsSchema = z
  .object({
    port: z.number().int().positive(),
    network: z.enum(["mainnet", "testnet"]),
    rpc_url: z.string().min(1, "rpc_url is required"),
    vesu_api_url: z.string().min(1, "vesu_api_url is required"),
    paymaster_url: z.string().min(1, "paymaster_url is required"),
    paymaster_api_key: z.string(),
    privy_app_id: z.string().min(1, "privy_app_id is required"),
    privy_app_secret: z.string().min(1, "privy_app_secret is required"),
    database_url: z.string().min(1, "database_url is required"),
    bridge_recovery_interval_ms: z.number().int().positive(),
  })
  .passthrough();

export type Settings = z.infer<typeof SettingsSchema>;

export function settingsFromTOML(filePath: string = DEFAULT_SETTINGS_FILE): Settings {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

  try {
    const fileContent = fs.readFileSync(resolvedPath, "utf-8");
    const parsed = parse(fileContent);
    return SettingsSchema.parse(parsed);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((entry) => `${entry.path.join(".")}: ${entry.message}`).join(", ");
      throw new Error(`Settings validation failed: ${issues}`);
    }
    if (error instanceof Error) {
      throw new Error(`Failed to load settings from ${resolvedPath}: ${error.message}`);
    }
    throw new Error(`Failed to load settings from ${resolvedPath}: Unknown error`);
  }
}

export const settings = settingsFromTOML();
