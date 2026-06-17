import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { DEFAULTS, PAYMENT_DOMAIN, PAYMENT_VERSION } from "./constants.js";
import { canonicalPaymentMessage, explorerTxUrl, LedgerForgeError } from "./utils.js";
import type {
  CallSkillOptions,
  InvokeOptions,
  InvokeResult,
  LedgerForgeConfig,
  ListSkillsFilter,
  PaymentAuthorization,
  PaymentChallenge,
  PaymentProof,
  SettlementReceipt,
  SkillListing,
} from "./types.js";

/**
 * LedgerForge SDK client (Solana). Discovers skills via the Bazaar, signs an
 * ed25519 payment authorization, and settles through the facilitator + x402_escrow.
 */
export class LedgerForgeClient {
  readonly bazaarUrl: string;
  readonly facilitatorUrl: string;
  readonly cluster: string;
  readonly connection: Connection;

  #keypair?: Keypair;

  constructor(config: LedgerForgeConfig = {}) {
    this.bazaarUrl = (config.bazaarUrl ?? DEFAULTS.bazaarUrl).replace(/\/$/, "");
    this.facilitatorUrl = (config.facilitatorUrl ?? DEFAULTS.facilitatorUrl).replace(/\/$/, "");
    this.cluster = config.cluster ?? DEFAULTS.cluster;
    this.connection = new Connection(config.rpcUrl ?? DEFAULTS.rpcUrl, "confirmed");

    if (config.keypair) {
      this.#keypair = config.keypair;
    } else if (config.secretKey) {
      this.#keypair = Keypair.fromSecretKey(config.secretKey);
    }
  }

  get hasSigner(): boolean {
    return Boolean(this.#keypair);
  }

  get publicKey(): PublicKey | undefined {
    return this.#keypair?.publicKey;
  }

  async listSkills(filter: ListSkillsFilter = {}): Promise<SkillListing[]> {
    const url = new URL("/skills", this.bazaarUrl);
    if (filter.tier) url.searchParams.set("tier", filter.tier);
    if (filter.minScore !== undefined) url.searchParams.set("minScore", String(filter.minScore));
    if (filter.search) url.searchParams.set("search", filter.search);

    const response = await fetch(url);
    if (!response.ok) {
      throw new LedgerForgeError("BAZAAR_ERROR", `Bazaar /skills returned ${response.status}`);
    }
    const body = (await response.json()) as { skills?: SkillListing[] } | SkillListing[];
    return Array.isArray(body) ? body : body.skills ?? [];
  }

  async getSkill(skillId: number): Promise<SkillListing> {
    const response = await fetch(new URL(`/skills/${skillId}`, this.bazaarUrl));
    if (response.status === 404) {
      throw new LedgerForgeError("SKILL_NOT_FOUND", `Skill ${skillId} not found`);
    }
    if (!response.ok) {
      throw new LedgerForgeError("BAZAAR_ERROR", `Bazaar /skills/${skillId} returned ${response.status}`);
    }
    return (await response.json()) as SkillListing;
  }

  async getPaymentChallenge(
    skillId: number,
    overrides: { resource?: string; amount?: string | bigint | number; asset?: string } = {},
  ): Promise<PaymentChallenge> {
    const url = new URL("/payment-details", this.facilitatorUrl);
    url.searchParams.set("skillId", String(skillId));
    if (overrides.resource) url.searchParams.set("resource", overrides.resource);
    if (overrides.amount !== undefined) url.searchParams.set("amount", String(overrides.amount));
    if (overrides.asset) url.searchParams.set("asset", overrides.asset);

    const response = await fetch(url);
    if (!response.ok) {
      throw new LedgerForgeError("FACILITATOR_ERROR", `/payment-details returned ${response.status}`);
    }
    return (await response.json()) as PaymentChallenge;
  }

  /** Sign the facilitator's challenge with the consumer's ed25519 key. */
  signPayment(
    challenge: PaymentChallenge,
    options: { recipient: string; amount?: bigint | string | number; jobId?: number; validForSeconds?: number },
  ): PaymentProof {
    const keypair = this.#keypair;
    if (!keypair) {
      throw new LedgerForgeError("NO_SIGNER", "No signer configured. Pass keypair or secretKey.");
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const authorization: PaymentAuthorization = {
      consumer: keypair.publicKey.toBase58(),
      provider: options.recipient,
      mint: challenge.asset,
      amount: BigInt(options.amount ?? challenge.maxAmountRequired).toString(),
      skillId: challenge.skillId,
      jobId: options.jobId ?? nowSec,
      nonce: Date.now(),
      validBefore: nowSec + (options.validForSeconds ?? 300),
    };

    const message = canonicalPaymentMessage(authorization, PAYMENT_DOMAIN, PAYMENT_VERSION);
    const signature = nacl.sign.detached(message, keypair.secretKey);

    return {
      scheme: "solana-ed25519",
      cluster: this.cluster,
      authorization,
      signature: bs58.encode(signature),
    };
  }

  /** Submit the signed proof to the facilitator for on-chain settlement. */
  async facilitate(proof: PaymentProof): Promise<SettlementReceipt> {
    const response = await fetch(new URL("/facilitate", this.facilitatorUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proof),
    });
    if (!response.ok) {
      throw new LedgerForgeError("SETTLEMENT_ERROR", `/facilitate returned ${response.status}: ${await response.text()}`);
    }
    const receipt = (await response.json()) as SettlementReceipt;
    if (receipt.settlementSignature && !receipt.explorerUrl) {
      receipt.explorerUrl = explorerTxUrl(receipt.settlementSignature, this.cluster);
    }
    return receipt;
  }

  /** Call the skill endpoint with the settlement access token. */
  async callSkill<T = unknown>(
    endpoint: string,
    accessToken: string,
    options: CallSkillOptions = {},
  ): Promise<T> {
    const method = options.method ?? "GET";
    const url = new URL(endpoint);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) url.searchParams.set(k, String(v));
    }
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) {
      throw new LedgerForgeError("SKILL_ERROR", `Skill ${endpoint} returned ${response.status}`);
    }
    return (await response.json()) as T;
  }

  /** Full flow: discover → challenge → sign → settle → call. */
  async invokeSkill<T = unknown>(skillId: number, options: InvokeOptions = {}): Promise<InvokeResult<T>> {
    const skill = await this.getSkill(skillId);
    const challenge = await this.getPaymentChallenge(skillId, { amount: options.amount });
    const proof = this.signPayment(challenge, {
      recipient: options.recipient ?? challenge.payTo ?? skill.provider,
      amount: options.amount,
      jobId: options.jobId,
      validForSeconds: options.validForSeconds,
    });
    if (options.reputationScore !== undefined) proof.reputationScore = options.reputationScore;

    const receipt = await this.facilitate(proof);
    const output = await this.callSkill<T>(skill.endpoint, receipt.accessToken, options);
    return { skillId, skillName: skill.name, output, receipt };
  }
}
