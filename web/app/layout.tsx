import type {Metadata} from "next";
import "./globals.css";
import {Providers} from "./providers";

export const metadata: Metadata = {
  title: "STRATA - compliance-partitioned liquidity",
  description:
    "One pool, one price curve, multiple legal strata. The compliance boundary sits on the position, not the pool. Built on Cleanverse CVI and CVA, deployed on Monad testnet.",
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
