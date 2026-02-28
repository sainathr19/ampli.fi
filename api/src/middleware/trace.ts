import type { Request, Response, NextFunction } from "express";
import { extractTraceIdFromHeaders, runWithTrace } from "./../lib/trace.js";

const TRACE_HEADER = "x-trace-id";

export function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceId = extractTraceIdFromHeaders(req.headers as Record<string, string | string[] | undefined>);
  res.setHeader(TRACE_HEADER, traceId);

  runWithTrace(traceId, () => {
    next();
  });
}
