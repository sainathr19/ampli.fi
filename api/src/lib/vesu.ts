import { settings } from "./settings.js";

const VESU_API_URL = settings.vesu_api_url.replace(/\/+$/, "");

export type VesuPoolsParams = {
  onlyVerified?: boolean;
  onlyEnabledAssets?: boolean;
};

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(`${VESU_API_URL}${path.startsWith("/") ? path : `/${path}`}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }

  return url.toString();
}

async function fetchVesu<T>(url: string): Promise<T> {
  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await upstream.text();

  if (!upstream.ok) {
    throw new Error(`Vesu request failed (${upstream.status}): ${text || upstream.statusText}`);
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function getPools(params?: VesuPoolsParams): Promise<unknown> {
  const url = buildUrl("/pools", {
    onlyVerified: params?.onlyVerified !== undefined ? String(params.onlyVerified) : undefined,
    onlyEnabledAssets:
      params?.onlyEnabledAssets !== undefined ? String(params.onlyEnabledAssets) : undefined,
  });

  return fetchVesu<unknown>(url);
}

export async function getPositions(walletAddress: string): Promise<unknown> {
  const url = buildUrl("/positions", { walletAddress });
  return fetchVesu<unknown>(url);
}

export async function getUserHistory(address: string): Promise<unknown> {
  const url = buildUrl(`/users/${encodeURIComponent(address)}/history`);
  return fetchVesu<unknown>(url);
}
