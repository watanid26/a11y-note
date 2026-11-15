// 수집한 화면 상태를 저장하고 발견 사항을 만든다.
// 서버 워커와 확장 업로드 API 가 같은 함수를 쓴다.

import { redactText, redactUrl } from "./security/url";
import { randomUUID } from "node:crypto";
import { findingsFromState } from "../core/judge";
import { getPack } from "../core/packs";
import type { CapturedState } from "../core/types";
import { sql } from "drizzle-orm";
import { db, finding, pageEvidence, pageState, scan, unmappedReference } from "./db";
import { evidenceRow, referenceRows } from "./evidence";
import { scrubLog } from "./security/log";
import { saveShot } from "./storage";
import { checkScreenshot } from "./upload-guard";

export interface IngestOptions {
  scanId: string;
  packId: string;
  templateKey?: string | null;
  reason?: string | null;
  screenshotOrigin?: { x: number; y: number } | null;
  /** 확장·파일 업로드처럼 밖에서 온 자료면 캡처를 검증한다 (P0-4) */
  untrusted?: boolean;
}

export async function ingestState(state: CapturedState, opts: IngestOptions): Promise<{ pageStateId: string; findings: number; warning?: string }> {
  const pack = getPack(opts.packId);
  const id = randomUUID();
  let screenshotKey: string | null = null;
  let warning: string | undefined;
  if (state.screenshot) {
    let bytes: Buffer | null = Buffer.from(state.screenshot, "base64");
    if (opts.untrusted) {
      const c = await checkScreenshot(state.screenshot);
      if (c.ok) bytes = c.bytes;
      else {
        bytes = null;
        warning = `캡처를 저장하지 않았습니다: ${c.reason}`;
      }
    }
    if (bytes) {
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      screenshotKey = `${opts.scanId}/${id}.${isJpeg ? "jpg" : "png"}`;
      await saveShot(screenshotKey, bytes);
    }
  }
  await db.insert(pageState).values({
    id,
    scanId: opts.scanId,
    url: redactUrl(state.url).slice(0, 2000), // 쿼리 속 개인정보는 저장하지 않는다 (Codex 리뷰 2)
    requestedUrl: state.navigation?.requestedUrl ? redactUrl(state.navigation.requestedUrl).slice(0, 2000) : redactUrl(state.url).slice(0, 2000),
    navigation: state.navigation
      ? {
          ...state.navigation,
          requestedUrl: redactUrl(state.navigation.requestedUrl),
          finalUrl: redactUrl(state.navigation.finalUrl),
          redirectChain: state.navigation.redirectChain.map((x) => ({ ...x, url: redactUrl(x.url) })),
        }
      : null,
    screenKind: state.screenKind ?? "unknown",
    screenReason: state.screenReason ?? null,
    title: redactText(state.title ?? "").slice(0, 300),
    label: redactText(state.label ?? "").slice(0, 200),
    flowId: state.flowId ?? null,
    flowStep: state.flowStep ?? null,
    templateKey: opts.templateKey ?? state.snapshot.templateSignature,
    reason: opts.reason ?? null,
    screenshotKey,
    screenshotScale: state.screenshotScale ?? 1,
    screenshotOrigin: opts.screenshotOrigin ?? null,
    applicable: state.snapshot.applicable,
    outline: state.snapshot.outline,
    keyboard: state.keyboard ?? null,
  });

  // 회차에 기준·엔진 버전 기록 (화면마다 엔진이 다르면 함께 남긴다)
  const engine = String(state.snapshot.coreVersion ?? "").slice(0, 120) || "unknown";
  await db.execute(sql`update a11y.scan set
      pack_version = coalesce(pack_version, ${pack.version}),
      engine_version = case
        when engine_version is null then ${engine}
        when position(${engine} in engine_version) > 0 then engine_version
        else left(engine_version || ' + ' || ${engine}, 300) end
    where id = ${opts.scanId}`);
  void scan;

  const drafts = findingsFromState(pack, state);
  if (drafts.length) {
    // 한 번에 너무 많이 넣지 않도록 나눈다
    for (let i = 0; i < drafts.length; i += 200) {
      await db.insert(finding).values(
        drafts.slice(i, i + 200).map((d) => ({
          scanId: opts.scanId,
          pageStateId: id,
          itemCode: d.itemCode,
          method: d.method,
          result: d.result,
          ruleId: d.ruleId,
          // 글 속 주소·이메일·토큰은 저장 전에 가린다
          message: redactText(d.message).slice(0, 1000),
          selector: d.selector.slice(0, 500),
          html: redactText(d.html).slice(0, 1000),
          box: d.box,
          candidate: d.candidate ? { ...d.candidate, text: Object.fromEntries(Object.entries(d.candidate.text ?? {}).map(([k, v]) => [k, typeof v === "string" ? (/^(url|href|src)$/.test(k) ? redactUrl(v) : redactText(v)) : v])) } : null,
        })),
      );
    }
  }
  // 원본 보존 자료 (0022). 판정과 무관하므로 표가 없거나(마이그레이션 미적용) 실패해도 저장 전체를 멈추지 않는다.
  try {
    const ev = evidenceRow(state, opts.scanId, id);
    if (ev) await db.insert(pageEvidence).values(ev);
    const refs = referenceRows(pack, state, opts.scanId, id);
    for (let i = 0; i < refs.length; i += 200) await db.insert(unmappedReference).values(refs.slice(i, i + 200));
  } catch (e) {
    console.warn("[ingest] 원본 보존 자료(통과·해당 없음·기준 외 참고)를 저장하지 못했습니다:", scrubLog((e as Error).message));
  }
  return { pageStateId: id, findings: drafts.length, warning };
}
