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
  res.json("Online");
});

app.use("/api/wallet", walletRoutes);
app.use("/api/paymaster", paymasterRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
