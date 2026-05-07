// HTTP smoke test for the new portal-sync routes — calls fastify.inject()
// with a forged session cookie for an existing user, exercising the routing
// layer (especially the `:format` extension routes).
import { randomBytes, randomUUID } from "node:crypto";
import { loadEnv } from "../src/config/index.js";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/db/connection.js";
import { initializeSchema } from "../src/db/schema.js";
import { hashToken } from "../src/db/auth-repository.js";

const env = loadEnv();
const userEmail = "danielcvt@gmail.com";

// Mint a session for the existing user directly in the DB (bypass login)
const db = createDatabase(env.SQLITE_DB_PATH);
initializeSchema(db);
const userRow = db
  .prepare("SELECT id FROM users WHERE email = ?")
  .get(userEmail) as { id: string } | undefined;
if (!userRow) {
  console.error(`user not found: ${userEmail}`);
  process.exit(1);
}
const userId = userRow.id;
const sessionToken = randomBytes(32).toString("base64url");
const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
db.prepare(
  `INSERT INTO sessions (id, user_id, token_hash, expires_at, revoked_at, created_at)
   VALUES (?, ?, ?, ?, NULL, ?)`,
).run(
  randomUUID(),
  userId,
  hashToken(sessionToken),
  expiresAt,
  new Date().toISOString(),
);
db.close();

// Boot Fastify and sign the cookie via the @fastify/cookie helper
const app = await createApp(env);
const signed = app.signCookie(sessionToken);

// @fastify/cookie does NOT prefix with "s:" — the signed cookie value is
// `<token>.<sig>` and unsignCookie strips the sig directly.
const cookieHeader = `session=${encodeURIComponent(signed)}`;

async function get(path: string): Promise<{ status: number; bytes: number; type: string | undefined; sample: string }> {
  const res = await app.inject({
    method: "GET",
    url: path,
    headers: { cookie: cookieHeader },
  });
  const body = res.payload ?? "";
  const sample = body.slice(0, 200).replace(/\n/g, " ");
  return {
    status: res.statusCode,
    bytes: Buffer.byteLength(body, "utf8"),
    type: res.headers["content-type"] as string | undefined,
    sample,
  };
}

async function post(path: string): Promise<{ status: number; sample: string }> {
  const res = await app.inject({
    method: "POST",
    url: path,
    headers: { cookie: cookieHeader },
  });
  return { status: res.statusCode, sample: (res.payload ?? "").slice(0, 200) };
}

const cnpj = "17774419000101";
const ata = "00394452000103-1-022743/2024-000001";
const codigoUasg = "160292";

console.log("\n--- Auth check ---");
console.log("GET /api/me/quota →", await get("/api/me/quota"));

console.log("\n--- Existing UASG sync routes ---");
console.log(
  "GET /api/me/uasgs/:codigoUasg/arps →",
  await get(`/api/me/uasgs/${codigoUasg}/arps`),
);

console.log("\n--- New supplier portal routes ---");
console.log(
  "GET /api/me/suppliers/:cnpj/portal-summary →",
  await get(`/api/me/suppliers/${cnpj}/portal-summary`),
);
console.log(
  "POST /api/me/suppliers/:cnpj/portal-sync →",
  await post(`/api/me/suppliers/${cnpj}/portal-sync`),
);

// Pick first empenho documento for this CNPJ
const db2 = createDatabase(env.SQLITE_DB_PATH);
const empRow = db2
  .prepare("SELECT documento FROM portal_empenhos WHERE cnpj = ? LIMIT 1")
  .get(cnpj) as { documento: string } | undefined;
db2.close();

if (empRow) {
  console.log(
    `GET /api/me/empenhos/${empRow.documento}/portal-detail →`,
    await get(`/api/me/empenhos/${encodeURIComponent(empRow.documento)}/portal-detail`),
  );
}

console.log("\n--- Export routes ---");
console.log(
  "GET /api/me/arps/:ata/export.csv →",
  await get(`/api/me/arps/${encodeURIComponent(ata)}/export.csv`),
);
console.log(
  "GET /api/me/arps/:ata/export.xlsx →",
  await get(`/api/me/arps/${encodeURIComponent(ata)}/export.xlsx`),
);
console.log(
  "GET /api/me/uasgs/:codigoUasg/export.csv →",
  await get(`/api/me/uasgs/${codigoUasg}/export.csv`),
);
console.log(
  "GET /api/me/uasgs/:codigoUasg/export.xlsx →",
  await get(`/api/me/uasgs/${codigoUasg}/export.xlsx`),
);

await app.close();
console.log("\nDONE");
