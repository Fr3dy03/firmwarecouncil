import Fastify from "fastify";
import cors from "@fastify/cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "./services/store.mts";
import { AuditService } from "./services/audit.mts";
import { AuthService } from "./services/auth.mts";
import { SigningKeysService } from "./services/keys.mts";
import { GovernanceService } from "./services/releases.mts";
import { BlockchainMirror } from "./services/blockchain.mts";
import { registerRoutes } from "./routes/index.mts";
import { attachUser, registerErrorHandler } from "./routes/common.mts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const store = new JsonStore(path.resolve(__dirname, "../data/db.json"));
const secret = process.env.FC_SESSION_SECRET ?? "firmwarecouncil-demo-secret-change-me";
const audit = new AuditService(store);
const auth = new AuthService(store, secret);
const keys = new SigningKeysService(store, audit);
const chain = new BlockchainMirror(store);
const gov = new GovernanceService(store, audit, chain);

const app = Fastify({ logger: { level: process.env.FC_LOG_LEVEL ?? "info" } });
await app.register(cors, { origin: true });
attachUser(app, auth);
registerErrorHandler(app);
registerRoutes(app as any, store, auth, keys, gov);

const port = Number(process.env.FC_API_PORT ?? 4100);
app.listen({ port, host: "127.0.0.1" }).then(() => {
  app.log.info(`FirmwareCouncil API listening on http://127.0.0.1:${port}`);
  app.log.info(`chain mirror: ${JSON.stringify(chain.status())}`);
});

export { app, store, audit, auth, keys, chain, gov };
