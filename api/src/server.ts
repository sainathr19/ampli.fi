import express from "express";
import cors from "cors";
import walletRoutes from "./routes/wallet.js";
import paymasterRoutes from "./routes/paymaster.js";
import vesuRoutes from "./routes/vesu.js";
import aggregatorRoutes from "./routes/aggregator.js";
import bridgeRoutes from "./routes/bridge.js";
import { settings } from "./lib/settings.js";

const app = express();
const PORT = settings.port;
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json("Online");
});

app.use("/api/wallet", walletRoutes);
app.use("/api/paymaster", paymasterRoutes);
app.use("/api/vesu", vesuRoutes);
app.use("/api", aggregatorRoutes);
app.use("/api/bridge", bridgeRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
