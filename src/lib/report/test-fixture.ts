// 테스트 전용: 실제 DB 행 모양의 점검 자료. 7가지 판정 상태가 모두 들어 있다.
//  5.1.1 image-alt  자동 fail + 점검자 fail        → 부적합 (확정)
//  7.1.1 html-has-lang 자동 fail                   → 부적합(자동)
//  6.1.2 kr-focus-indicator 자동 fail + 점검자 pass → 문제 미발견(자동)  (사람이 "오류 아님"으로 본 위치는 문제로 세지 않음)
//  8.2.1 aria-allowed-role 자동 review              → 검토 필요
//  5.3.1 ai-table pending (AI 대기)                 → 검토 필요
//  6.4.2 ai-title AI pass (이전 버전 저장분)         → 검토 필요
//  6.4.4 항목 결정 na                              → 해당 없음
//  6.5.1 항목 결정 pass                            → 적합
//  5.2.1 영상 없음, 발견 없음                       → 해당 없음(자동)
//  미점검: 화면 없는 점검 (emptyView)
import type { Finding, PageState, Project, Scan } from "../db";
import { buildScanView, type ScanView } from "../scan-view";

const T = new Date("2026-10-01T01:00:00Z");
const APPL = { images: 2, media: 0, tables: 1, forms: 0, inputs: 0, links: 5, newWindowLinks: 0, carousels: 0, captchas: 0, iframes: 0, timeLimitHint: false, accessKeys: 0 };

export function project(pack = "kwcag22"): Project {
  return { id: "p1", ownerEmail: "t@example.com", clientName: null, name: "테스트 사이트", baseUrl: "https://example.go.kr/", targetEnvironment: "production", pack, maxPages: 10, uploadToken: null, uploadTokenHash: null, uploadTokenLast4: null, uploadTokenExpiresAt: null, aiEnabled: false, auditorName: null, createdAt: T } as Project;
}
export function scanRow(aiConfig = "AI 꺼짐 (규칙 기반 판단)", pack = "kwcag22", scopeStatus: "pending" | "approved" = "approved"): Scan {
  return { id: "s1", projectId: "p1", source: "browser", status: "done", progress: null, error: null, label: null, packVersion: pack === "jis2016" ? "JIS X 8341-3:2016" : "KWCAG 2.2 (2026)", engineVersion: "test", aiConfig, skipped: [], plan: null, scopeStatus, scopeMode: scopeStatus === "approved" ? "public_pages" : null, scopeReviewedBy: scopeStatus === "approved" ? "tester@example.com" : null, scopeReviewedAt: scopeStatus === "approved" ? T : null, leaseUntil: null, createdAt: T, startedAt: T, finishedAt: T } as unknown as Scan;
}
function page(id: string, label: string, url: string): PageState {
  return { id, scanId: "s1", url, title: label, label, flowId: null, flowStep: null, templateKey: null, reason: "첫 화면", screenshotKey: `shots/${id}.png`, screenshotScale: 1, screenshotOrigin: null, screenshotDeletedAt: null, applicable: APPL, outline: null, keyboard: null, createdAt: T } as unknown as PageState;
}
let n = 0;
function f(pageStateId: string, itemCode: string, ruleId: string, method: string, result: string, humanResult: "fail" | "pass" | null, extra: Partial<Finding> = {}): Finding {
  n++;
  return {
    id: `f${n}`, scanId: "s1", pageStateId, itemCode, method, result, ruleId,
    message: `${ruleId} 메시지 ${n}`, selector: `#el-${n}`, html: `<div id="el-${n}"></div>`,
    box: { x: 1, y: 1, w: 10, h: 10 }, candidate: null, confidence: null, aiReason: null, aiSuggestion: null,
    humanResult, reviewNote: null, reviewedBy: null, reviewedAt: null, createdAt: T, ...extra,
  } as Finding;
}

export const PAGES = [page("pg1", "홈", "https://example.go.kr/"), page("pg2", "공지사항 목록", "https://example.go.kr/board/notice/list.do?menuId=1234&page=1&name=홍길동&token=secret#top")];

export function findings(): Finding[] {
  n = 0;
  return [
    f("pg1", "5.1.1", "image-alt", "auto", "fail", "fail"),
    f("pg1", "7.1.1", "html-has-lang", "auto", "fail", null, { selector: "html" }),
    f("pg2", "7.1.1", "html-has-lang", "auto", "fail", null, { selector: "html" }),
    f("pg1", "6.1.2", "kr-focus-indicator", "auto", "fail", "pass"),
    f("pg2", "8.2.1", "aria-allowed-role", "auto", "review", null),
    f("pg2", "5.3.1", "ai-table", "ai", "pending", null),
    f("pg1", "6.4.2", "ai-title", "ai", "pass", null, { aiReason: "[규칙 판정] 제목이 사이트 이름만 있음" }),
  ];
}

export function fixtureView(opts: { aiConfig?: string; pack?: string } = {}): ScanView {
  return buildScanView(scanRow(opts.aiConfig, opts.pack), project(opts.pack), PAGES, findings(), [
    { itemCode: "6.4.4", status: "na", note: "고정 참조 위치 없음" },
    { itemCode: "6.5.1", status: "pass", note: null },
  ], []);
}

export function emptyView(): ScanView {
  return buildScanView(scanRow(), project(), [], [], [], []);
}
