import express from "express";
import cors from "cors";
import walletRoutes from "./routes/wallet.js";
import paymasterRoutes from "./routes/paymaster.js";
import vesuRoutes from "./routes/vesu.js";
import aggregatorRoutes from "./routes/aggregator.js";
import bridgeRoutes from "./routes/bridge.js";
import earnRoutes from "./routes/earn.js";
import { traceMiddleware } from "./middleware/trace.js";
import { settings } from "./lib/settings.js";
import { runMigrations } from "./db/migrate.js";

const app = express();
const PORT = settings.port;
app.use(cors());
app.use(express.json());
app.use(traceMiddleware);

app.get("/", (_req, res) => {
  res.json("Online");
});

app.use("/api/wallet", walletRoutes);
app.use("/api/paymaster", paymasterRoutes);
app.use("/api/vesu", vesuRoutes);
app.use("/api", aggregatorRoutes);
app.use("/api/bridge", bridgeRoutes);
app.use("/api/earn", earnRoutes);

async function start(): Promise<void> {
  await runMigrations();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
