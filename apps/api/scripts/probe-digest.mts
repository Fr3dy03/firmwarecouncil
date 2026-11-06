/** Diff viem's hashTypedData vs the on-chain/probe digest to find the divergent piece. */
import { hashTypedData, hashDomain, keccak256, concat, toHex } from "viem";

const anchor = "0x17bba97aae88649ea9c057cdf11bc9999036e45f3012c0c48f03ff739c2138f5" as `0x${string}`;
const nonce = 1n;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const probe = "0x0f34e83d268c84a4e3cbd711e0eed013f679b6d6" as `0x${string}`;

const onChainDigest = "0x8a168d27e9bb70d65857a821d68342bd8dea6b0272eb15f8f869f4150450e98b" as `0x${string}`;

const domain = { name: "FirmwareCouncil", version: "1", chainId: 968, verifyingContract: probe };
const types = {
  Approval: [
    { name: "releaseId", type: "bytes32" },
    { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
const message = { releaseId: anchor, decision: 0 as const, nonce, deadline };

const viemDigest = await hashTypedData({ domain, types, primaryType: "Approval" as const, message });
console.log("viem digest  :", viemDigest);
console.log("chain digest :", onChainDigest, viemDigest === onChainDigest ? "MATCH" : "MISMATCH");

const viemDomainSeparator = await hashDomain({ domain });
console.log("viem domain  :", viemDomainSeparator);
console.log("onchain domain: 0x2e7d87c628fdb2ee8229417915194b71467a9b3162e46ab787ab7d9ed7726b4e");
