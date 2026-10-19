import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL?.replace(/^["']|["']$/g, "").trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return drizzle(neon(databaseUrl), { schema });
}
