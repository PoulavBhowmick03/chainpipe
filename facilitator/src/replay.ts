import { Connection, PublicKey } from "@solana/web3.js";
import { getJobRecord, ChainPipeAddresses } from "@chainpipe/solana";

/** Restart-safe replay guard: in-memory set + on-chain JobRecord existence. */
export class ReplayGuard {
  private seen = new Set<string>();

  constructor(
    private connection: Connection,
    private addresses: ChainPipeAddresses
  ) {}

  private key(jobId: Uint8Array): string {
    return Buffer.from(jobId).toString("hex");
  }

  /** True if this job has already been recorded (in-memory or on-chain). */
  async isReplay(jobId: Uint8Array): Promise<boolean> {
    if (this.seen.has(this.key(jobId))) return true;
    const record = await getJobRecord(this.connection, jobId, this.addresses);
    if (record) {
      this.seen.add(this.key(jobId));
      return true;
    }
    return false;
  }

  markRecorded(jobId: Uint8Array): void {
    this.seen.add(this.key(jobId));
  }
}
