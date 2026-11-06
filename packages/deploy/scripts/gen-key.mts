import { randomBytes } from "node:crypto";
import { privateKeyToAddress } from "viem/accounts";
const key = `0x${randomBytes(32).toString("hex")}`;
console.log(JSON.stringify({ key, address: privateKeyToAddress(key) }));
