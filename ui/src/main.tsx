import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@/components/providers/PrivyProvider";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider>
      <App />
    </PrivyProvider>
  </StrictMode>
);
