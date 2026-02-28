import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface TraceContext {
  traceId: string;
}

const traceStorage = new AsyncLocalStorage<TraceContext>();

const TRACE_HEADERS = ["x-trace-id", "x-request-id", "traceparent"] as const;

export function getTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId;
}

export function runWithTrace<T>(traceId: string, fn: () => T): T {
  return traceStorage.run({ traceId }, fn);
}

export function runWithTraceAsync<T>(traceId: string, fn: () => Promise<T>): Promise<T> {
  return traceStorage.run({ traceId }, fn);
}

export function generateTraceId(): string {
  return randomUUID();
}

export function extractTraceIdFromHeaders(headers: Record<string, string | string[] | undefined>): string {
  for (const name of TRACE_HEADERS) {
    const val = headers[name];
    if (typeof val === "string" && val.trim()) return val.trim();
    if (Array.isArray(val) && val[0]) return String(val[0]).trim();
  }
  return generateTraceId();
}
