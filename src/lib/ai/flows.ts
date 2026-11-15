// AI 로 "점검해야 할 흐름" 목록과 길 안내를 다듬는다.
// 규칙으로 찾은 흐름을 바탕으로, 메뉴 구조를 보고 빠진 업무 흐름을 더하고 안내 문구를 구체화한다.

import { and, eq } from "drizzle-orm";
import type { PageOutline } from "../../core/types";
import { db, flow } from "../db";
import { suggestFlows, type FlowKind, type FlowSuggestion } from "../flows";
import { flags } from "../flags";
import { scrubLog } from "../security/log";
import { aiConfigured, callAI, extractJson } from "./client";

const KINDS: FlowKind[] = ["search", "login", "signup", "apply", "reserve", "contact", "order", "mypage"];

export async function refineFlowsWithAi(base: FlowSuggestion[], outlines: PageOutline[], locale: "ko" | "ja"): Promise<FlowSuggestion[]> {
  if (!aiConfigured() || !flags().aiFlows) return base;
  const menu = outlines.flatMap((o) => o.navLinks).slice(0, 120).map((l) => `${l.text} → ${l.href}`).join("\n");
  const system =
    locale === "ja"
      ? "ウェブアクセシビリティ試験の計画者として、試験すべき一連の業務フロー（ログイン、申請、予約など）を選び、試験者への具体的な案内を書いてください。決済・確定・退会などの取り消せない操作の直前で止めるよう必ず書いてください。JSONのみ出力。"
      : "웹 접근성 점검 계획자로서, 점검해야 할 업무 흐름(로그인, 신청, 예약 등)을 고르고 점검자에게 줄 구체적인 길 안내를 씁니다. 결제·확정·탈퇴처럼 되돌릴 수 없는 버튼 직전에서 멈추라고 반드시 적습니다. JSON 만 출력합니다.";
  const prompt = `사이트 메뉴:\n${menu}\n\n규칙으로 찾은 흐름:\n${JSON.stringify(base.map((b) => ({ kind: b.kind, name: b.name, startUrl: b.startUrl })))}\n\n다음 형식의 JSON 배열로 답하세요 (최대 8개, kind 는 ${KINDS.join("|")} 중 하나):\n[{"kind":"apply","name":"민원 신청서 작성","startUrl":"https://...","guide":"1) … 2) … 3) …","stopBefore":"최종 신청 버튼"}]`;
  try {
    const text = await callAI({ system, content: [{ type: "text", text: prompt }], maxTokens: 1500 });
    const list = extractJson<Partial<FlowSuggestion>[]>(text);
    const out: FlowSuggestion[] = [];
    for (const f of list) {
      if (!f.kind || !KINDS.includes(f.kind as FlowKind) || !f.name) continue;
      const prev = base.find((b) => b.kind === f.kind);
      out.push({
        kind: f.kind as FlowKind,
        name: String(f.name).slice(0, 80),
        startUrl: f.startUrl ? String(f.startUrl) : prev?.startUrl ?? null,
        guide: String(f.guide ?? prev?.guide ?? "").slice(0, 800),
        stopBefore: f.stopBefore ? String(f.stopBefore).slice(0, 120) : prev?.stopBefore ?? null,
        autoTry: prev?.autoTry ?? false,
      });
    }
    // AI 가 빠뜨린 규칙 흐름은 유지
    for (const b of base) if (!out.some((o) => o.kind === b.kind)) out.push(b);
    return out;
  } catch (e) {
    console.warn("[ai] 흐름 안내 실패, 규칙 결과 사용:", scrubLog((e as Error).message));
    return base;
  }
}

/** 프로젝트에 흐름 제안을 저장한다 (이미 있는 종류는 건드리지 않음). 저장된 흐름을 돌려준다. */
export async function saveFlowSuggestions(projectId: string, outlines: PageOutline[], baseUrl: string, locale: "ko" | "ja") {
  const base = suggestFlows(outlines, baseUrl);
  const refined = await refineFlowsWithAi(base, outlines, locale);
  const existing = await db.select().from(flow).where(eq(flow.projectId, projectId));
  for (const s of refined) {
    if (existing.some((e) => e.kind === s.kind)) continue;
    await db.insert(flow).values({
      projectId,
      name: s.name,
      kind: s.kind,
      startUrl: s.startUrl,
      guide: s.guide,
      stopBefore: s.stopBefore,
      status: "suggested",
      source: aiConfigured() && flags().aiFlows ? "ai" : "heuristic",
    });
  }
  return db.select().from(flow).where(and(eq(flow.projectId, projectId)));
}
