// Raw IDL JSON, exported for browser clients that build Anchor programs from a
// wallet-adapter wallet (no Keypair). These ship in dist/idl (see build script).
import bondedRegistryIdl from "./idl/bonded_registry.json";
import dagEscrowIdl from "./idl/dag_escrow.json";
import reputationBridgeIdl from "./idl/reputation_bridge.json";

export { bondedRegistryIdl, dagEscrowIdl, reputationBridgeIdl };
