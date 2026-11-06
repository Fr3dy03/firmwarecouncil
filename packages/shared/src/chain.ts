/**
 * BOT Chain (Bohr) configuration — validated 2026-11-06 against
 * dev-docs.botchain.ai and live eth_chainId calls.
 * Docs: https://dev-docs.botchain.ai/docs/Developers/quick-guide/
 */
export const BIG_CHAINS = {
  mainnet: {
    chainId: 677,
    name: "BOT Chain Mainnet",
    rpcUrl: "https://rpc.botchain.ai",
    explorerUrl: "https://scan.botchain.ai/",
    explorerTx: (hash: string) => `https://scan.botchain.ai/tx/${hash}`,
    explorerAddr: (addr: string) => `https://scan.botchain.ai/address/${addr}`,
    getLogsDisabled: true,      // official mainnet endpoints disable eth_getLogs
  },
  testnet: {
    chainId: 968,
    name: "BOT Chain Testnet",
    rpcUrl: "https://rpc.bohr.life",
    explorerUrl: "https://scan.bohr.life/",
    explorerTx: (hash: string) => `https://scan.bohr.life/tx/${hash}`,
    explorerAddr: (addr: string) => `https://scan.bohr.life/address/${addr}`,
    getLogsDisabled: false,
  },
} as const;

export type ChainName = keyof typeof BIG_CHAINS;

export function resolveChain(name: ChainName = "testnet") {
  return BIG_CHAINS[name];
}

/** Never build release history on an unrestricted log indexer (FRC-D01). */
export const HISTORY_POLICY = {
  useDirectContractReads: true,
  useStoredTxReceipts: true,
  useBackendTxHistory: true,
  useReconciliationJobs: true,
  allowOptionalIndexer: "opt-in, separately verified infra only",
};
