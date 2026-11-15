#!/usr/bin/env node
// 워커 생존 확인 (클라우드·실행 환경과 무관): 워커가 15초마다 쓰는 상태 파일이 최근 것인지 본다.
//   node scripts/worker-health.mjs            정상이면 종료 코드 0, 아니면 1
// docker HEALTHCHECK · systemd · k8s liveness 등 어떤 실행 환경에서도 같은 명령을 쓴다.
//   WORKER_HEALTH_FILE      상태 파일 (기본 /tmp/a11ynote-worker-health.json)
//   WORKER_HEALTH_MAX_AGE   이 초보다 오래되면 비정상 (기본 90)
// DB·네트워크에 접속하지 않는다 (격리된 워커 안에서도 동작, 외부 의존 없음).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFAULT_HEALTH_FILE = "/tmp/a11ynote-worker-health.json";

/** 상태 파일 내용으로 정상 여부를 판단한다 (테스트용으로 분리) */
export function checkHealth(raw, now = Date.now(), maxAgeSec = 90) {
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "상태 파일을 읽을 수 없음" };
  }
  const at = Date.parse(s?.at ?? "");
  if (!Number.isFinite(at)) return { ok: false, reason: "상태 파일에 시각 없음" };
  const ageSec = Math.round((now - at) / 1000);
  if (ageSec > maxAgeSec) return { ok: false, ageSec, state: s.state, reason: `상태가 ${ageSec}초 동안 갱신되지 않음` };
  return { ok: true, ageSec, state: s.state, scanId: s.scanId ?? null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.env.WORKER_HEALTH_FILE || DEFAULT_HEALTH_FILE;
  const max = Number(process.env.WORKER_HEALTH_MAX_AGE || 90);
  let raw = "";
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    console.log(JSON.stringify({ ok: false, reason: "상태 파일 없음" }));
    process.exit(1);
  }
  const r = checkHealth(raw, Date.now(), max);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
