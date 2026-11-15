// 업무 흐름의 주요 분기 경로 (3단계, 0024). WCAG-EM 3.d: 과정은 기본 경로뿐 아니라 오류·취소·다른 선택 갈래도 확인한다.
// 쌓기만 한다. 상태를 바꿀 때는 새 기록이 supersedes 로 이전 기록을 가리키고, 서류에는 최신 판만 센다.

import { z } from "zod";
import type { FlowBranch } from "./db";
import { redactText } from "./security/url";

export const BRANCH_STATUS = ["planned", "tested", "blocked", "na"] as const;
export const BRANCH_STATUS_LABEL: Record<"ko" | "ja", Record<FlowBranch["status"], string>> = {
  ko: { planned: "확인 예정", tested: "확인함", blocked: "확인 못 함", na: "해당 없음" },
  ja: { planned: "確認予定", tested: "確認済み", blocked: "確認不可", na: "適用なし" },
};

export const BranchInput = z.object({
  flowId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  fromStep: z.number().int().min(0).max(1000).optional().nullable(),
  condition: z.string().max(1000).optional(),
  expected: z.string().max(1000).optional(),
  status: z.enum(BRANCH_STATUS),
  scanId: z.string().uuid().optional().nullable(),
  pageStateId: z.string().uuid().optional().nullable(),
  note: z.string().max(2000).optional(),
  supersedes: z.string().uuid().optional().nullable(),
});
export type BranchInputT = z.infer<typeof BranchInput>;

export function branchRow(projectId: string, x: BranchInputT, by: string) {
  return {
    projectId,
    flowId: x.flowId,
    name: redactText(x.name),
    fromStep: x.fromStep ?? null,
    condition: redactText(x.condition ?? ""),
    expected: redactText(x.expected ?? ""),
    status: x.status,
    scanId: x.scanId ?? null,
    pageStateId: x.pageStateId ?? null,
    note: redactText(x.note ?? ""),
    supersedes: x.supersedes ?? null,
    createdBy: by,
  };
}

export function currentBranches(rows: FlowBranch[]): FlowBranch[] {
  const replaced = new Set(rows.map((r) => r.supersedes).filter(Boolean));
  return rows.filter((r) => !replaced.has(r.id));
}

export function redactBranch(r: FlowBranch): FlowBranch {
  return { ...r, name: redactText(r.name), condition: redactText(r.condition), expected: redactText(r.expected), note: redactText(r.note) };
}

/** 흐름별 분기 수 (최신 판 기준) */
export function branchSummary(rows: FlowBranch[]): { total: number; tested: number; planned: number; blocked: number; na: number } {
  const cur = currentBranches(rows);
  const n = (s: FlowBranch["status"]) => cur.filter((r) => r.status === s).length;
  return { total: cur.length, tested: n("tested"), planned: n("planned"), blocked: n("blocked"), na: n("na") };
}
