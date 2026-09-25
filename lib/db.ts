import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";

import { PrismaClient } from "@/generated/prisma/client";

neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * DATABASE_ADAPTER selects the Prisma driver adapter:
 *  - "neon" (default) — Neon's WebSocket serverless driver, per the original
 *    stack choice. Only works against a real Neon database.
 *  - "pg" — the standard node-postgres driver, for any regular Postgres
 *    (e.g. Render Postgres, used for the Phase 0 real-integration proof run
 *    while no Neon project/credentials were available). Set this alongside
 *    DATABASE_URL when not pointing at Neon.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapterKind = process.env.DATABASE_ADAPTER ?? "neon";
  const adapter = adapterKind === "pg" ? new PrismaPg({ connectionString }) : new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Lazy proxy: merely importing this module must never touch DATABASE_URL or
// open a connection, because Next.js's build-time route-data collection
// imports every API route module (and therefore this one) without any
// runtime environment configured. The real PrismaClient is constructed only
// on first actual property access, i.e. the first request that uses it.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
