import {createConfig, http} from "wagmi";
import {injected} from "wagmi/connectors";
import {monadTestnet} from "./strata";

// Injected connector only. The app signs real transactions from a browser-extension
// wallet (MetaMask and compatibles) against Monad testnet.
export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"),
  },
  ssr: true,
});
