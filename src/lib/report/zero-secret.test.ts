// zero-secret 회귀: 원본 주소·HTML·메시지에 넣은 비밀값이 화면 자료·서류 3종·AI 입력·로그 어디에도 남지 않아야 한다
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { Finding, PageState } from "../db";
import { aiSafeText } from "../ai/judge";
import { scrubLog } from "../security/log";
import { buildScanView } from "../scan-view";
import { viewJson } from "../view-json";
import { buildChecklist } from "./checklist";
import { buildReport } from "./docx";
import { buildFixRequests } from "./fixes";
import { PAGES, findings, project, scanRow } from "./test-fixture";

const SECRETS = ["SECRETTOKEN0001", "홍길동", "hong.gildong@example.com", "010-2222-3333", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ6ZXJvIn0.c2lnbmF0dXJl", "SESSIONABCDEF123456", "900101-1234567"];
const RAW_URL = `https://example.go.kr/my/info.do;jsessionid=SESSIONABCDEF123456?menuId=77&name=홍길동&token=SECRETTOKEN0001&mail=hong.gildong%40example.com#tel=010-2222-3333`;

function dirtyView() {
  const pages = [PAGES[0], { ...PAGES[1], url: RAW_URL, label: "내 정보 hong.gildong@example.com", title: "내 정보" } as PageState];
  const fs = findings().map((f, i) =>
    i === 2
      ? ({
          ...f,
          html: `<a href="/logout.do?token=SECRETTOKEN0001">x</a><img src="${RAW_URL}">`,
          message: `링크 ${RAW_URL} 에 문제 — 문의 hong.gildong@example.com, 010-2222-3333, 900101-1234567`,
          aiReason: "[규칙 판정] eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ6ZXJvIn0.c2lnbmF0dXJl 이 노출",
        } as Finding)
      : f,
  );
  const s = { ...scanRow(), skipped: [{ url: RAW_URL, reason: "점검 오류" }] };
  return buildScanView(s as never, project(), pages, fs, [], []);
}

async function allText(): Promise<Record<string, string>> {
  const v = dirtyView();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildChecklist(v)) as never);
  let xlsx = "";
  wb.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => (xlsx += `${c.value}\n`))));
  const zip = await JSZip.loadAsync(await buildReport(v, { loadShot: async () => null }));
  const docx = (await zip.file("word/document.xml")!.async("string")).replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  return {
    xlsx,
    docx,
    md: buildFixRequests(v),
    view: JSON.stringify(viewJson(v)),
    ai: JSON.stringify(aiSafeText({ url: RAW_URL, href: RAW_URL, context: `주변 글 ${RAW_URL} hong.gildong@example.com`, alt: "010-2222-3333" })),
    log: scrubLog(`GET ${RAW_URL} 실패 hong.gildong@example.com`, 2000),
  };
}

describe("zero-secret: 원본 주소·비밀값이 결과물에 남지 않음", () => {
  it("서류 3종·화면 자료·AI 입력·로그", async () => {
    const out = await allText();
    for (const [where, text] of Object.entries(out)) {
      for (const secret of SECRETS) expect(text.includes(secret), `${where} 에 ${secret}`).toBe(false);
      expect(text.includes(RAW_URL), `${where} 에 원본 주소`).toBe(false);
      expect(/token=|session|jsessionid|#tel=/i.test(text.replace(/sessionStorage/g, "")), `${where} 에 쿼리·조각 흔적`).toBe(false);
    }
    // 화면 구분용 허용 쿼리는 남는다 (보고서에서 화면을 찾을 수 있게)
    expect(out.xlsx).toContain("https://example.go.kr/my/info.do?menuId=77");
  });
});
