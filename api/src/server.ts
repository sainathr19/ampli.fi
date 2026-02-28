import "dotenv/config";
import express from "express";
import cors from "cors";
import walletRoutes from "./routes/wallet.js";
import paymasterRoutes from "./routes/paymaster.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    status: "Amplify API running",
    version: "1.0.0",
    endpoints: {
      walletCreate: "POST /api/wallet/starknet",
      walletSign: "POST /api/wallet/sign",
      paymaster: "POST /api/paymaster/*",
    },
  });
});

app.use("/api/wallet", walletRoutes);
app.use("/api/paymaster", paymasterRoutes);

app.listen(PORT, () => {
  console.log(`Amplify API v1.0.0`);
  console.log(`Server running on http://localhost:${PORT}`);
});
