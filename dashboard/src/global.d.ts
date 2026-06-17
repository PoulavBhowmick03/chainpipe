export {}

// TEMPORARY: kept only while the remaining EVM payment files (PaymentModal,
// list/page, useBrowserWalletClient) are ported to Solana wallet-adapter. Remove
// this declaration once no `window.ethereum` references remain.
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on: (event: string, handler: (...args: unknown[]) => void) => void
    }
  }
}
