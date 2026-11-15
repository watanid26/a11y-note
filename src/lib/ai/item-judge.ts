// 항목 판정: 자동 규칙만으로 결론이 나지 않는 항목(수동 점검 항목, 해소되지 않은 오류 의심)에
// 점검이 끝난 뒤 점검노트가 적합·부적합·해당 없음 중 하나를 정한다 (core/verdict.ts).
// AI 를 쓸 수 있으면 대표 페이지 캡처와 점검 결과를 보여 주고 판정을 받는다. 못 쓰면 규칙(ruleItemVerdict)으로 정한다.
// 판정은 회차마다 한 번 쓰고 고치지 않는다. 점검자 판정(item_decision)이 있으면 화면·서류에서 그것이 우선한다.

import { and, asc, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { summarizeItems, type FindingMethod, type FindingResult, type ItemSummary } from "../../core/judge";
import { getPack } from "../../core/packs";
import type { PackItem } from "../../core/packs/types";
import { isVerdict, ruleItemVerdict, type Verdict } from "../../core/verdict";
import { db, finding, itemDecision, itemVerdict, pageState, project, scan } from "../db";
import { scrubLog } from "../security/log";
import { aiSafeUrl, redactText } from "../security/url";
import { loadShot } from "../storage";
import { aiConfigured, aiModel, aiProvider, BudgetExceeded, callAI, extractJson, type ContentBlock } from "./client";

export const ITEM_PROMPT_VERSION = "i2";
/** 회차 처리 완료 표시 (항목 코드가 아닌 행) */
const DONE_MARK = "*";
const MAX_SHOTS = 3;

const SYSTEM_KO = `당신은 한국형 웹 콘텐츠 접근성 지침(KWCAG 2.2)과 WCAG 2.2 품질인증 심사 경험이 많은 웹 접근성 심사원입니다.
자동 점검 도구가 결론을 내지 못한 검사 항목마다 최종 판정을 내립니다. 판정을 미루지 않습니다.
- verdict: "pass"(적합) | "fail"(부적합) | "na"(해당 없음, 점검한 페이지에 그 항목과 관련된 콘텐츠가 없음) 중 하나만 씁니다.
- 캡처와 자동 점검 결과에서 오류 근거가 보이면 fail, 관련 콘텐츠가 있고 오류 근거가 없으면 pass 입니다.
- 근거가 약하면 판정은 그대로 내리되 confidence 를 낮게(0.3~0.6) 줍니다.
- evidence: 판정 근거가 된 관찰 사실을 60자 이내 한 문장으로, "~해요/~있어요/~없어요"처럼 해요체로 끝맺습니다. 추측·인사말 없이 씁니다.
반드시 JSON 배열만 출력: [{"code":"5.4.1","verdict":"pass|fail|na","confidence":0~1,"evidence":"…"}]`;

const SYSTEM_JA = `あなたはJIS X 8341-3:2016およびWCAG 2.2の試験経験が豊富なウェブアクセシビリティ試験員です。
自動チェックで結論が出なかった達成基準ごとに最終判定を下します。判定を保留しません。
- verdict: "pass"(適合) | "fail"(不適合) | "na"(適用なし) のいずれか。
- 根拠が弱い場合も判定は出し、confidenceを低く(0.3〜0.6)します。
- evidence: 判定根拠となった観察事実を60文字以内の一文で。
必ずJSON配列のみを出力: [{"code":"…","verdict":"pass|fail|na","confidence":0~1,"evidence":"…"}]`;

export interface ItemJudgeInput {
  item: Pick<PackItem, "code" | "title" | "how">;
  open: { ruleId: string; text: string }[];
}

/** AI 에게 보낼 항목 설명 (개인정보·주소 쿼리 제거) */
export function itemPromptLine(x: ItemJudgeInput): string {
  const open = x.open.slice(0, 5).map((o) => `  - ${o.ruleId}: ${redactText(o.text).slice(0, 160)}`).join("\n");
  return `[${x.item.code}] ${x.item.title}\n  점검 방법: ${x.item.how.slice(0, 300)}${open ? `\n  자동 점검이 남긴 오류 의심:\n${open}` : "\n  자동 점검이 남긴 오류 의심: 없음"}`;
}

/** AI 응답 → 항목별 판정. 형식이 깨졌으면 예외, 모르는 코드·잘못된 판정은 무시 */
export function itemVerdictsFromAiText(text: string, codes: Set<string>): Map<string, { verdict: Verdict; confidence: number; evidence: string }> {
  const parsed = extractJson<{ code?: string; verdict?: string; confidence?: number; evidence?: string }[]>(text);
  if (!Array.isArray(parsed)) throw new Error("AI 응답이 배열이 아닙니다.");
  const out = new Map<string, { verdict: Verdict; confidence: number; evidence: string }>();
  for (const p of parsed) {
    const code = String(p?.code ?? "");
    if (!codes.has(code) || !isVerdict(p.verdict)) continue;
    const evidence = redactText(String(p.evidence ?? "")).replace(/\s+/g, " ").trim().slice(0, 120);
    out.set(code, { verdict: p.verdict, confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)), evidence: evidence || "AI 판정 (근거 문장 없음)" });
  }
  return out;
}

/** 규칙으로 결론이 안 난 항목 (점검자 판정이 있는 항목은 빼고) */
export function itemsToJudge(items: ItemSummary[]): ItemSummary[] {
  return items.filter((i) => i.status === "review" && i.decidedBy !== "human");
}

/** 폭 900px 로 줄이고 위쪽 1400px 만 남긴다 (토큰 절약) */
async function shrink(png: Buffer): Promise<Buffer | null> {
  try {
    const r = await sharp(png).resize({ width: 900, withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
    return await sharp(r.data).extract({ left: 0, top: 0, width: r.info.width, height: Math.min(r.info.height, 1400) }).jpeg({ quality: 70 }).toBuffer();
  } catch {
    return null;
  }
}

/** 한 회차의 항목 판정을 내린다. 이미 했거나 오류 의심 정리(pending)가 남아 있으면 건너뛴다. 처리했으면 true */
export async function judgeScanItems(scanId: string): Promise<boolean> {
  const [row] = await db.select({ s: scan, p: project }).from(scan).innerJoin(project, eq(project.id, scan.projectId)).where(eq(scan.id, scanId)).limit(1);
  if (!row || row.s.status !== "done") return false;
  const done = await db.select({ id: itemVerdict.id }).from(itemVerdict).where(and(eq(itemVerdict.scanId, scanId), eq(itemVerdict.itemCode, DONE_MARK))).limit(1);
  if (done.length) return false;
  const [pages, findings, decisions] = await Promise.all([
    db.select().from(pageState).where(eq(pageState.scanId, scanId)).orderBy(asc(pageState.createdAt)),
    db.select().from(finding).where(eq(finding.scanId, scanId)),
    db.select().from(itemDecision).where(eq(itemDecision.scanId, scanId)),
  ]);
  if (findings.some((f) => f.result === "pending" && !f.humanResult)) return false;

  const pack = getPack(row.p.pack);
  const items = summarizeItems(
    pack,
    findings.map((f) => ({ itemCode: f.itemCode, method: f.method as FindingMethod, result: f.result as FindingResult, humanResult: f.humanResult ?? null })),
    pages.map((p) => p.applicable),
    decisions.map((d) => ({ itemCode: d.itemCode, status: d.status as "pass", note: d.note })),
  );
  const targets = itemsToJudge(items);
  const locale = row.p.pack === "jis2016" ? "ja" : "ko";
  const inputs: ItemJudgeInput[] = targets.map((t) => ({
    item: pack.items.find((i) => i.code === t.code)!,
    open: findings
      .filter((f) => f.itemCode === t.code && !f.humanResult && (f.result === "review" || f.result === "pending"))
      .map((f) => ({ ruleId: f.ruleId, text: f.aiReason || f.message })),
  }));

  let fromAi = new Map<string, { verdict: Verdict; confidence: number; evidence: string }>();
  if (targets.length && aiConfigured() && row.p.aiEnabled) {
    try {
      const content: ContentBlock[] = [];
      const shots = pages.filter((p) => p.screenshotKey).slice(0, MAX_SHOTS);
      for (const p of shots) {
        const raw = await loadShot(p.screenshotKey!).catch(() => null);
        const img = raw ? await shrink(raw) : null;
        content.push({ type: "text", text: `페이지: ${redactText(p.title).slice(0, 80)} (${aiSafeUrl(p.url)})` });
        if (img) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.toString("base64") } });
      }
      content.push({ type: "text", text: `점검한 페이지 ${pages.length}개. 아래 항목마다 판정해 주세요.\n\n${inputs.map(itemPromptLine).join("\n\n")}` });
      const text = await callAI({ system: locale === "ja" ? SYSTEM_JA : SYSTEM_KO, content, maxTokens: Math.min(8000, 1024 + targets.length * 200) });
      fromAi = itemVerdictsFromAiText(text, new Set(targets.map((t) => t.code)));
    } catch (e) {
      if (!(e instanceof BudgetExceeded)) console.warn("[ai] 항목 판정 실패, 규칙 판정으로 대체:", scrubLog((e as Error).message));
    }
  }

  const rows: (typeof itemVerdict.$inferInsert)[] = targets.map((t) => {
    const ai = fromAi.get(t.code);
    const v = ai ?? ruleItemVerdict(t);
    return {
      scanId,
      itemCode: t.code,
      verdict: v.verdict,
      confidence: v.confidence,
      evidence: v.evidence,
      source: ai ? "ai" : "rule",
      model: ai ? `${aiProvider()}/${aiModel()}` : null,
      promptVersion: ai ? ITEM_PROMPT_VERSION : null,
    };
  });
  rows.push({ scanId, itemCode: DONE_MARK, verdict: "done", confidence: 1, evidence: "", source: "rule", model: null, promptVersion: null });
  await db.insert(itemVerdict).values(rows).onConflictDoNothing();
  return true;
}

/** 끝난 회차 중 항목 판정이 없는 것을 최대 limit 개 처리 (최근 14일) */
export async function processItemVerdicts(limit = 3): Promise<number> {
  const ids = (await db.execute(sql`
    select s.id from a11y.scan s
    where s.status = 'done' and s.created_at > now() - interval '14 days'
      and not exists (select 1 from a11y.item_verdict v where v.scan_id = s.id and v.item_code = ${DONE_MARK})
      and not exists (select 1 from a11y.finding f where f.scan_id = s.id and f.result = 'pending' and f.human_result is null)
    order by s.created_at desc limit ${limit}`).catch(() => [])) as unknown as { id: string }[];
  let n = 0;
  for (const { id } of ids) if (await judgeScanItems(id).catch((e) => (console.warn("[ai] 항목 판정 오류", scrubLog((e as Error).message)), false))) n++;
  return n;
}
