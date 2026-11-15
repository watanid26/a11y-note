import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// 이 프로젝트는 a11y 스키마만 다룬다 (같은 DB 의 다른 서비스 스키마는 건드리지 않음)
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["a11y"],
  migrations: { schema: "a11y", table: "__drizzle_migrations" },
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL! },
  strict: true,
});
