import type {Metadata} from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STRATA - compliance-partitioned liquidity",
  description:
    "One pool, one price curve, multiple legal strata. The compliance boundary sits on the position, not the pool.",
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
