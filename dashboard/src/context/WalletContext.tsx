'use client'
// Solana-native wallet context. Keeps the same { account, connecting, error, connect,
// disconnect } shape the rest of the app already consumes, but backs it with the Solana
// wallet-adapter (Phantom/Solflare/Backpack). `account` is the base58 public key.
import { createContext, useContext, useMemo } from 'react'
import { useWallet as useAdapterWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

interface WalletContextType {
  account: string | null
  connecting: boolean
  error: string
  connect: () => Promise<void>
  disconnect: () => void
}

const WalletContext = createContext<WalletContextType>({
  account: null, connecting: false, error: '',
  connect: async () => {}, disconnect: () => {},
})

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, connecting, disconnect: adapterDisconnect } = useAdapterWallet()
  const { setVisible } = useWalletModal()

  const value = useMemo<WalletContextType>(() => ({
    account: publicKey ? publicKey.toBase58() : null,
    connecting,
    error: '',
    connect: async () => { setVisible(true) },
    disconnect: () => { void adapterDisconnect() },
  }), [publicKey, connecting, setVisible, adapterDisconnect])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  return useContext(WalletContext)
}
