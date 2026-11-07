import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Rome does not document PUSH0 / MCOPY / TSTORE support; an unimplemented
      // opcode aborts the whole transaction, so target Paris.
      evmVersion: "paris",
    },
  },
  networks: {
    hadrian: {
      type: "http",
      chainType: "l1",
      chainId: 200010,
      url: "https://hadrian.testnet.romeprotocol.xyz/",
      accounts: [configVariable("PRIVATE_KEY")],
    },
    rubicon: {
      type: "http",
      chainType: "l1",
      chainId: 7531,
      url: "https://rubicon.mainnet.romeprotocol.xyz/",
      accounts: [configVariable("RUBICON_PRIVATE_KEY")],
    },
  },
});
