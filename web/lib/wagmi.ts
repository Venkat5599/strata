import {createConfig, http} from "wagmi";
import {injected} from "wagmi/connectors";
import {monadTestnet} from "./strata";

// Injected connector only. The demo signs real transactions from a browser-extension
// wallet (MetaMask and compatibles) against Monad testnet.
export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {[monadTestnet.id]: http("https://testnet-rpc.monad.xyz")},
  ssr: true,
});
