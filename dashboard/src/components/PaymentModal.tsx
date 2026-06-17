'use client'
import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import type { Skill } from '@/lib/types'
import ReputationGauge from './ReputationGauge'
import TierBadge from './TierBadge'

const USDC_DECIMALS = 6
const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet'
const PAYMENT_DOMAIN = 'LedgerForge-Solana'
const PAYMENT_VERSION = '1'

// minimal base58 (btc alphabet) — avoids adding a dep for encoding the signature
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function bs58encode(bytes: Uint8Array): string {
  let x = 0n
  for (const b of bytes) x = x * 256n + BigInt(b)
  let out = ''
  while (x > 0n) { out = B58[Number(x % 58n)] + out; x /= 58n }
  for (const b of bytes) { if (b === 0) out = '1' + out; else break }
  return out
}

// Must match the SDK/facilitator canonicalPaymentMessage byte-for-byte.
function canonicalMessage(a: {
  consumer: string; provider: string; mint: string; amount: string
  skillId: number; jobId: number; nonce: number; validBefore: number
}): Uint8Array {
  const lines = [
    PAYMENT_DOMAIN, PAYMENT_VERSION, a.consumer, a.provider, a.mint, a.amount,
    String(a.skillId), String(a.jobId), String(a.nonce), String(a.validBefore),
  ]
  return new TextEncoder().encode(lines.join('\n'))
}

interface PaymentModalProps {
  skill: Skill
  onClose: () => void
  onSuccess?: (signature: string | null) => void
}

type Step = 'review' | 'signing' | 'processing' | 'success' | 'error'
const STEP_INDEX: Record<Step, number> = { review: 1, signing: 2, processing: 3, success: 4, error: 4 }

export default function PaymentModal({ skill, onClose, onSuccess }: PaymentModalProps) {
  const { publicKey, signMessage, connecting } = useWallet()
  const { setVisible } = useWalletModal()
  const account = publicKey ? publicKey.toBase58() : null

  const [step, setStep] = useState<Step>('review')
  const [sig, setSig] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const fee = (skill.price * 0.002).toFixed(4)
  const providerCut = (skill.price * 0.998).toFixed(4)
  const stepIdx = STEP_INDEX[step]

  async function handlePay() {
    setErrorMsg('')
    if (!account || !signMessage) { setVisible(true); return }

    try {
      const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL
      if (!facilitatorUrl) throw new Error('NEXT_PUBLIC_FACILITATOR_URL not set.')

      const rawAmount = Math.round(skill.price * Math.pow(10, USDC_DECIMALS))
      const amount = String(rawAmount > 0 ? rawAmount : 50_000)
      const detailsRes = await fetch(
        `${facilitatorUrl}/payment-details?skillId=${skill.id}&amount=${amount}&resource=/skills/${skill.id}`
      )
      if (!detailsRes.ok) throw new Error(`Could not fetch payment details: HTTP ${detailsRes.status}`)
      const details = await detailsRes.json() as { payTo: string; asset: string }

      const now = Math.floor(Date.now() / 1000)
      const authorization = {
        consumer: account,
        provider: details.payTo,
        mint: details.asset,
        amount,
        skillId: parseInt(skill.id),
        jobId: now,
        nonce: Math.floor(Math.random() * 1_000_000_000),
        validBefore: now + 300,
      }

      setStep('signing')
      const signature = await signMessage(canonicalMessage(authorization))
      setStep('processing')

      const proof = {
        scheme: 'solana-ed25519' as const,
        cluster: CLUSTER,
        authorization,
        signature: bs58encode(signature),
      }

      const res = await fetch(`${facilitatorUrl}/facilitate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proof),
      })
      const receipt = await res.json() as { success: boolean; settlementSignature?: string; error?: string }
      if (!res.ok || !receipt.success) throw new Error(receipt.error ?? `Facilitation failed: HTTP ${res.status}`)

      const s = receipt.settlementSignature ?? null
      setSig(s)
      setStep('success')
      onSuccess?.(s)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment failed.'
      if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('user denied')) {
        setErrorMsg('Signature rejected. Hit "Sign payment" again when ready.')
        setStep('review')
        return
      }
      setErrorMsg(msg)
      setStep('error')
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ position: 'relative' }}>
        <button className="modal-close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>

        <div className="progress-bar">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`seg ${stepIdx > n ? 'done' : stepIdx === n ? 'active' : ''}`} />
          ))}
        </div>

        <div className="t-label" style={{ marginBottom: 6 }}>
          Step {Math.min(stepIdx, 4)} of 4 ·{' '}
          {step === 'review' ? 'Review' : step === 'signing' ? 'Sign' : step === 'processing' ? 'Settle' : step === 'success' ? 'Done' : 'Error'}
        </div>

        {step === 'review' && (
          <StepReview
            skill={skill} fee={fee} providerCut={providerCut}
            connected={!!account} account={account}
            onPay={handlePay} onCancel={onClose} connecting={connecting}
          />
        )}
        {step === 'signing' && <StepSigning />}
        {step === 'processing' && <StepProcessing />}
        {step === 'success' && <StepSuccess sig={sig} skill={skill} onClose={onClose} />}
        {step === 'error' && (
          <StepError message={errorMsg} onRetry={() => { setErrorMsg(''); setStep('review') }} onCancel={onClose} />
        )}
      </div>
    </div>
  )
}

function StepReview({
  skill, fee, providerCut, connected, account, onPay, onCancel, connecting,
}: {
  skill: Skill; fee: string; providerCut: string
  connected: boolean; account: string | null
  onPay: () => void; onCancel: () => void; connecting: boolean
}) {
  return (
    <>
      <h2 className="t-display" style={{ fontSize: 24, margin: '0 0 20px', letterSpacing: '-0.01em' }}>
        Access {skill.name}
      </h2>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: 16,
        background: 'var(--lf-surface-2)', border: '1px solid var(--lf-border)', borderRadius: 6, marginBottom: 24,
      }}>
        <ReputationGauge score={skill.score === 0 ? null : skill.score} size={48} strokeWidth={4} />
        <div style={{ flex: 1 }}>
          <div className="t-mono" style={{ fontSize: 14, color: 'var(--lf-ink)' }}>
            {skill.score === 0 ? 'No reputation yet' : `${skill.score}/100`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--lf-ink-3)', fontFamily: 'var(--f-mono)', marginTop: 2 }}>
            {skill.jobs} job{skill.jobs !== 1 ? 's' : ''} completed
          </div>
        </div>
        <TierBadge tier={skill.tier} />
      </div>

      <div style={{ textAlign: 'center', padding: '16px 0', marginBottom: 12 }}>
        <div className="t-label" style={{ marginBottom: 8 }}>Total payment</div>
        <div className="t-mono" style={{ fontSize: 42, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--lf-ink)' }}>
          {skill.price.toFixed(2)} <span style={{ fontSize: 18, color: 'var(--lf-ink-3)' }}>USDC</span>
        </div>
      </div>

      <div style={{
        padding: '12px 0', borderTop: '1px solid var(--lf-border)', borderBottom: '1px solid var(--lf-border)',
        marginBottom: 20, fontFamily: 'var(--f-mono)', fontSize: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--lf-ink-2)' }}>
          <span>→ Provider</span><span>{providerCut} USDC</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--lf-ink-3)' }}>
          <span>→ Facilitator fee (0.2%)</span><span>{fee} USDC</span>
        </div>
      </div>

      {connected && account ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'var(--lf-accent-bg)', border: '1px solid rgba(15,190,127,0.3)', borderRadius: 6,
          fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--lf-accent-2)', marginBottom: 20,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lf-accent)', flexShrink: 0 }} />
          {account.slice(0, 4)}…{account.slice(-4)}
          <span style={{ marginLeft: 'auto', color: 'var(--lf-ink-3)' }}>Solana</span>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'var(--lf-surface-2)', border: '1px solid var(--lf-border)', borderRadius: 6,
          fontSize: 12, color: 'var(--lf-ink-3)', marginBottom: 20,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lf-border-strong)', flexShrink: 0 }} />
          No wallet connected · will prompt on sign
        </div>
      )}

      <button className="btn btn-primary btn-full btn-lg" onClick={onPay} disabled={connecting}>
        {connecting ? 'Connecting…' : !connected ? 'Connect Wallet' : 'Sign payment'}
      </button>
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button onClick={onCancel} style={{ color: 'var(--lf-ink-3)', fontSize: 13 }}>Cancel</button>
      </div>
    </>
  )
}

function StepSigning() {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div className="spinner" style={{ margin: '0 auto 24px' }} />
      <h3 className="t-display" style={{ fontSize: 20, margin: '0 0 8px' }}>Signing ed25519 payment intent…</h3>
      <p style={{ color: 'var(--lf-ink-3)', fontSize: 13, margin: '0 0 24px', lineHeight: 1.5 }}>
        Check your wallet; a message-signature request has been sent.<br />
        No gas required. No tokens moved yet.
      </p>
      <div style={{
        display: 'inline-block', fontFamily: 'var(--f-mono)', fontSize: 11, padding: '6px 12px',
        background: 'var(--lf-surface-2)', border: '1px solid var(--lf-border)', borderRadius: 4, color: 'var(--lf-ink-2)',
      }}>
        Domain: LedgerForge-Solana · v1 · {CLUSTER}
      </div>
    </div>
  )
}

function StepProcessing() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setProgress((p) => Math.min(95, p + 4)), 100)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <h3 className="t-display" style={{ fontSize: 20, margin: '0 0 8px' }}>Settling on Solana…</h3>
      <p style={{ color: 'var(--lf-ink-3)', fontSize: 13, margin: '0 0 28px' }}>
        Facilitator is verifying your signature and releasing escrow.
      </p>
      <div style={{ height: 4, background: 'var(--lf-border)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--lf-accent)', transition: 'width .12s' }} />
      </div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lf-ink-3)', display: 'flex', justifyContent: 'space-between' }}>
        <span>verify ed25519</span><span>→ complete_job</span><span>→ record_rep</span>
      </div>
    </div>
  )
}

function StepSuccess({ sig, skill, onClose }: { sig: string | null; skill: Skill; onClose: () => void }) {
  const accessToken = sig ? `lfx_${sig.slice(0, 16)}` : `lfx_${skill.id}_mock`
  const explorer = sig ? `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}` : null
  const [copied, setCopied] = useState(false)

  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div className="checkmark">
        <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path className="path" d="M5 12l5 5L20 7" />
        </svg>
      </div>
      <h3 className="t-display" style={{ fontSize: 22, margin: '0 0 8px' }}>Payment settled</h3>
      <p style={{ color: 'var(--lf-ink-2)', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
        Confirmed on Solana {CLUSTER}. Scroll down to try your skill.
      </p>

      <div style={{
        padding: 16, background: 'var(--lf-surface-2)', border: '1px solid var(--lf-border)', borderRadius: 6,
        marginBottom: 16, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {explorer && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="t-label" style={{ margin: 0 }}>Settlement tx</span>
            <a href={explorer} target="_blank" rel="noopener noreferrer"
              className="t-mono" style={{ fontSize: 11, color: 'var(--lf-accent)' }}>
              {sig!.slice(0, 8)}… ↗
            </a>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="t-label" style={{ margin: 0 }}>Access token</span>
          <button
            onClick={() => navigator.clipboard.writeText(accessToken).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })}
            style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: copied ? 'var(--lf-accent)' : 'var(--lf-ink-2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {accessToken.slice(0, 16)}… {copied ? '✓ copied' : '⎘'}
          </button>
        </div>
      </div>

      <button className="btn btn-primary btn-full btn-lg" onClick={onClose}>Try it now ↓</button>
    </div>
  )
}

function StepError({ message, onRetry, onCancel }: { message: string; onRetry: () => void; onCancel: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{
        width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%', background: 'var(--lf-red-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--lf-red)" strokeWidth="2.5" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" />
        </svg>
      </div>
      <h3 className="t-display" style={{ fontSize: 22, margin: '0 0 8px' }}>Payment could not settle</h3>
      <p style={{ color: 'var(--lf-ink-2)', fontSize: 13, margin: '0 0 8px', lineHeight: 1.5 }}>{message}</p>
      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lf-ink-3)', padding: 10,
        background: 'var(--lf-surface-2)', borderRadius: 4, marginBottom: 24, textAlign: 'left',
      }}>
        No funds were transferred. Wallet was not charged.
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-ghost btn-full" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-full" onClick={onRetry}>Retry</button>
      </div>
    </div>
  )
}
