import pino from "pino";
import { getTraceId } from "./trace.js";

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
});

function bindTrace(logger: pino.Logger): pino.Logger {
  const traceId = getTraceId();
  if (traceId) {
    return logger.child({ traceId });
  }
  return logger;
}

export const log = {
  info: (msg: string, obj?: Record<string, unknown>) => {
    bindTrace(baseLogger).info(obj ?? {}, msg);
  },
  warn: (msg: string, obj?: Record<string, unknown>) => {
    bindTrace(baseLogger).warn(obj ?? {}, msg);
  },
  error: (msg: string, obj?: Record<string, unknown>) => {
    bindTrace(baseLogger).error(obj ?? {}, msg);
  },
  child: (bindings: Record<string, unknown>) => bindTrace(baseLogger).child(bindings),
};
