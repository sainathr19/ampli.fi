"use client";

import { PrivyProvider as Privy } from "@privy-io/react-auth";
import type { ReactNode } from "react";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

interface PrivyProviderProps {
  children: ReactNode;
}

export function PrivyProvider({ children }: PrivyProviderProps) {
  if (!PRIVY_APP_ID) {
    return <>{children}</>;
  }

  const loginMethods = (import.meta.env.VITE_PRIVY_LOGIN_METHODS || "email")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <Privy
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: loginMethods.length > 0 ? loginMethods : ["email"],
        appearance: {
          theme: "light",
          accentColor: "#171717",
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
      }}
    >
      {children}
    </Privy>
  );
}
