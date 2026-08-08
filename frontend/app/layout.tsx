import type {Metadata} from "next";
import {Poppins} from "next/font/google";
import "./globals.css";
import {Providers} from "./providers";

const display = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "STRATA - compliance-partitioned liquidity",
  description:
    "One pool, one price curve, multiple legal strata. The compliance boundary sits on the position, not the pool. Built on Cleanverse CVI and CVA, deployed on Monad testnet.",
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={display.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
