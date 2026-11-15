// 워커 수명 관리 (Priority B): 여러 대 실행·정상 종료·실행 환경과 무관한 생존 확인.
//  - 회차는 DB 에서 "for update skip locked" 로 한 워커만 가져간다 (worker/main.ts claimScan). 워커를 여러 대 띄워도 같은 회차를 겹쳐 잡지 않는다.
//  - SIGTERM/SIGINT 를 받으면 새 회차를 가져가지 않고, 진행 중인 회차는 유예 시간 안에 끝나기를 기다린다.
//    유예 시간이 지나면 그 회차를 "실패(사용량 차감 없음)"로 정리하고 종료한다. 이미 저장된 화면·발견 사항이 있어 다시 대기열에 넣지 않는다.
//  - 생존 확인은 상태 파일(scripts/worker-health.mjs) 로 한다. 특정 클라우드의 상태 API 에 기대지 않는다.
import { writeFileSync, renameSync } from "node:fs";
import { hostname } from "node:os";

export type WorkerState = "starting" | "idle" | "busy" | "stopping";

export function workerId(env: Record<string, string | undefined> = process.env): string {
  const raw = env.WORKER_ID || hostname() || "worker";
  return raw.replace(/[^\w.-]/g, "_").slice(0, 64);
}

export function stopGraceMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.WORKER_STOP_GRACE_MS ?? 50_000);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 10 * 60_000) : 50_000;
}

export interface HealthState {
  id: string;
  state: WorkerState;
  scanId: string | null;
  at: string;
  version: string;
}

export class WorkerLife {
  state: WorkerState = "starting";
  scanId: string | null = null;
  stopRequestedAt: number | null = null;
  constructor(
    readonly id: string,
    readonly version: string,
    private readonly healthFile: string | null,
  ) {}

  get stopping(): boolean {
    return this.stopRequestedAt !== null;
  }

  set(state: WorkerState, scanId: string | null = this.scanId): void {
    this.state = this.stopping ? "stopping" : state;
    this.scanId = scanId;
    this.writeHealth();
  }

  /** 종료 요청: 새 회차를 가져가지 않는다. 진행 중인 회차가 있으면 그 id 를 돌려준다 */
  requestStop(now = Date.now()): string | null {
    if (this.stopRequestedAt === null) this.stopRequestedAt = now;
    this.state = "stopping";
    this.writeHealth();
    return this.scanId;
  }

  snapshot(now = new Date()): HealthState {
    return { id: this.id, state: this.state, scanId: this.scanId, at: now.toISOString(), version: this.version };
  }

  /** 상태 파일을 원자적으로 바꿔 쓴다 (읽는 쪽이 반쯤 쓴 파일을 보지 않게) */
  writeHealth(now = new Date()): void {
    if (!this.healthFile) return;
    try {
      const tmp = `${this.healthFile}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.snapshot(now)));
      renameSync(tmp, this.healthFile);
    } catch {
      // 상태 파일 실패는 작업을 멈추지 않는다 (생존 확인 쪽에서 오래된 파일로 감지)
    }
  }
}
