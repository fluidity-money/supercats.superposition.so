import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

export const superposition = defineChain({
  id: 55_244,
  name: "Superposition",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.superposition.so"] },
  },
  blockExplorers: {
    default: { name: "Superposition Explorer", url: "https://explorer.superposition.so" },
  },
});

export const config = createConfig({
  chains: [superposition],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [superposition.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
