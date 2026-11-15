import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { databaseUrl } from "@/lib/env";
import * as schema from "./schema";

// Supabase 연결 풀러(transaction 모드, 6543 포트)는 prepared statement 를 지원하지 않으므로 prepare:false.
// 연결은 처음 쿼리할 때 연다 — 환경변수가 없는 빌드 단계에서도 import 만으로는 실패하지 않는다.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

/**
 * 서버리스(Vercel)에서는 함수 인스턴스가 여러 개 떠서 연결이 금방 쌓인다.
 * Supabase 풀러의 session 모드(5432)는 동시 연결이 풀 크기(15)로 막히므로 transaction 모드(6543)로 바꿔 쓴다.
 * (실제 장애: 점검 진행 화면이 2초마다 묻는 동안 EMAXCONNSESSION 으로 모든 요청이 실패)
 */
export function serverlessUrl(url: string, env: Record<string, string | undefined> = process.env): string {
  if (!env.VERCEL) return url;
  try {
    const u = new URL(url);
    if (/\.pooler\.supabase\.com$/.test(u.hostname) && (u.port === "5432" || u.port === "")) {
      u.port = "6543";
      return u.toString();
    }
  } catch {
    /* 주소 형식이 이상하면 그대로 */
  }
  return url;
}

function connect() {
  const url = databaseUrl();
  if (!url) throw new Error("DB 주소가 설정되지 않았습니다 (DATABASE_URL 또는 Supabase 연동의 POSTGRES_URL).");
  const serverless = Boolean(process.env.VERCEL);
  return postgres(serverlessUrl(url), {
    prepare: false,
    max: serverless ? 2 : process.env.NODE_ENV === "production" ? 3 : 5,
    idle_timeout: serverless ? 5 : 20,
    connect_timeout: 10,
  });
}

function getSql() {
  if (!globalForDb.sql) globalForDb.sql = connect();
  return globalForDb.sql;
}

// sql`...` · sql.unsafe(...) 를 그대로 쓸 수 있게 첫 사용 때 실제 연결로 위임한다.
export const sql = new Proxy(function () {} as unknown as ReturnType<typeof postgres>, {
  apply: (_t, _this, args) => (getSql() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => {
    const real = getSql() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

type Db = ReturnType<typeof drizzle<typeof schema>>;
const globalForOrm = globalThis as unknown as { db?: Db };

function getDb(): Db {
  if (!globalForOrm.db) globalForOrm.db = drizzle(getSql(), { schema });
  return globalForOrm.db;
}

export const db = new Proxy({} as Db, {
  get: (_t, prop) => {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});
export * from "./schema";
