// Priority B: 워커 정상 종료·생존 확인 (실행 환경과 무관)
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// 순수 JS 스크립트 (docker HEALTHCHECK 에서 tsx 없이 실행)
import { checkHealth } from "../../../scripts/worker-health.mjs";
import { stopGraceMs, WorkerLife, workerId } from "./worker-life";

describe("워커 id·유예 시간", () => {
  it("WORKER_ID 를 쓰고, 안전한 글자만 남김", () => {
    expect(workerId({ WORKER_ID: "vm-1/a b" })).toBe("vm-1_a_b");
    expect(workerId({}).length).toBeGreaterThan(0);
  });
  it("유예 시간 기본 50초, 0~10분으로 제한", () => {
    expect(stopGraceMs({})).toBe(50_000);
    expect(stopGraceMs({ WORKER_STOP_GRACE_MS: "999999999" })).toBe(600_000);
    expect(stopGraceMs({ WORKER_STOP_GRACE_MS: "-1" })).toBe(50_000);
  });
});

describe("종료 요청", () => {
  it("진행 중 회차를 알려 주고, 이후 상태는 계속 stopping", () => {
    const l = new WorkerLife("w1", "e1", null);
    l.set("busy", "scan-1");
    expect(l.requestStop()).toBe("scan-1");
    expect(l.stopping).toBe(true);
    l.set("idle", null);
    expect(l.state).toBe("stopping");
  });
  it("대기 중에 받으면 진행 중 회차 없음", () => {
    const l = new WorkerLife("w1", "e1", null);
    l.set("idle");
    expect(l.requestStop()).toBeNull();
  });
});

describe("생존 확인 상태 파일", () => {
  it("파일을 원자적으로 쓰고 (임시 파일이 남지 않음), 확인 스크립트가 읽음", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "a11y-health-"));
    const file = path.join(dir, "h.json");
    const l = new WorkerLife("w1", "e1", file);
    l.set("busy", "scan-1");
    expect(readdirSync(dir)).toEqual(["h.json"]);
    const r = checkHealth(readFileSync(file, "utf8"));
    expect(r).toMatchObject({ ok: true, state: "busy", scanId: "scan-1" });
  });
  it("오래된 파일·깨진 파일은 비정상", () => {
    const at = new Date("2026-10-24T00:00:00Z");
    const raw = JSON.stringify({ at: at.toISOString(), state: "idle" });
    expect(checkHealth(raw, +at + 60_000, 90).ok).toBe(true);
    expect(checkHealth(raw, +at + 120_000, 90)).toMatchObject({ ok: false, ageSec: 120 });
    expect(checkHealth("{", Date.now()).ok).toBe(false);
    expect(checkHealth("{}", Date.now()).ok).toBe(false);
  });
  it("확인 스크립트는 DB·네트워크를 쓰지 않음", () => {
    const src = readFileSync(path.resolve(__dirname, "../../../scripts/worker-health.mjs"), "utf8");
    expect(src).not.toMatch(/fetch\(|node:net|node:http|DATABASE_URL|postgres/);
  });
});
