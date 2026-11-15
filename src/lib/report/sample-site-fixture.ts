// 테스트 전용: 실제 공공기관 사이트 점검과 같은 모양의 가상 자료.
// 인트로·접속 안내·같은 최종 URL 화면, 숨은 스킵 링크, 키 큰 요소, AI 해석·규칙 대체 혼합, axe 원문 메시지.
import type { Finding, PageState } from "../db";
import { buildScanView } from "../scan-view";
import { project, scanRow } from "./test-fixture";

const T = new Date("2026-10-12T13:00:00Z");
const APPL = { images: 3, media: 0, tables: 0, forms: 0, inputs: 0, links: 5, newWindowLinks: 0, carousels: 0, captchas: 0, iframes: 0, timeLimitHint: false, accessKeys: 0 };
function page(id: string, label: string, url: string, kind: string): PageState {
  return { id, scanId: "s1", url, title: label, label, flowId: null, flowStep: null, templateKey: null, reason: "개별 페이지", screenshotKey: `shots/${id}.png`, screenshotScale: 1, screenshotOrigin: null, screenshotDeletedAt: null, applicable: APPL, outline: null, keyboard: null, screenKind: kind, requestedUrl: null, navigation: null, createdAt: T } as unknown as PageState;
}
let n = 0;
function f(pg: string, item: string, rule: string, method: string, result: string, extra: Partial<Finding> = {}): Finding {
  n++;
  return { id: `k${n}`, scanId: "s1", pageStateId: pg, itemCode: item, method, result, ruleId: rule, message: `${rule} 메시지`, selector: `#k-${n}`, html: `<div id="k-${n}"></div>`, box: { x: 300, y: 300, w: 120, h: 40 }, candidate: null, confidence: 0.5, aiReason: null, aiSuggestion: null, humanResult: null, reviewNote: null, reviewedBy: null, reviewedAt: null, createdAt: T, ...extra } as Finding;
}

export const AI_FREE_TEXT = "참고(AI 의견, 확인 필요): 웹사이트 및 해당 인트로 페이지의 성격을 나타내는 적절한 페이지 제목이 제공되었습니다. 또한 전반적으로 사용자 경험을 고려한 구성으로 보입니다.";
export const AXE_RAW = "엘리먼트는 반드시 충분한 명도 대비를 가져야 합니다. — 엘리먼트가 배경색과 1:1의 명암비를 가집니다.";

export function sampleSiteLike(opts: { representative?: boolean } = {}) {
  n = 0;
  const pages = opts.representative
    ? [page("p1", "홈", "https://www.example.go.kr/main.html", "normal"), page("p2", "예매", "https://www.example.go.kr/ticket.html", "normal")]
    : [
        page("p1", "홈", "https://www.gov-sample.kr/intro", "intro"),
        page("p2", "예시기관 - 함께 잇다", "https://www.gov-sample.kr/intro", "intro"),
        page("p3", "예시기관 - 함께 잇다", "https://www.gov-sample.kr/intro", "intro"),
        page("p4", "네트워크/방화벽 정책 등록 안내", "https://www.gov-sample.kr/public/info/urlList.html", "diagnostic"),
      ];
  const ids = pages.map((p) => p.id);
  const fs: Finding[] = [];
  // 숨은 스킵 링크 (1×1px) — 목적지 없음
  for (const pg of ids.slice(0, 3)) fs.push(f(pg, "6.4.1", "kr-skip-link", "auto", "fail", { message: "건너뛰기 링크의 목적지가 페이지에 없습니다. — #container 요소를 찾을 수 없습니다.", selector: "#accessibility > a:nth-of-type(1)", box: { x: 0, y: 0, w: 1, h: 1 } }));
  // 첫 초점이 스킵 링크가 아님 (버튼)
  fs.push(f(ids[ids.length - 1], "6.4.1", "kr-skip-link", "auto", "fail", { message: "페이지 맨 앞에 본문 바로가기 링크가 없습니다. — 첫 번째 초점 요소가 건너뛰기 링크가 아닙니다.", selector: "body > div > button" }));
  // 키 큰 요소 (자르는 높이보다 큼)
  for (const pg of ids.slice(0, 3)) fs.push(f(pg, "8.1.1", "duplicate-id", "auto", "fail", { message: '같은 id 를 여러 요소가 씁니다. — id="introDiv" 가 2번 쓰였습니다.', selector: "#wrap > div:nth-of-type(2)", box: { x: 0, y: 170, w: 1280, h: 900 } }));
  // 제목: AI 해석 2건(코드형 1, 이전 자유문장 1) + 규칙 대체 2건
  fs.push(f(ids[0], "6.4.2", "ai-title", "ai", "review", { selector: "title", box: null, aiReason: '[AI:title_generic] 제목 "예시기관 - 함께 잇다"' }));
  fs.push(f(ids[1], "6.4.2", "ai-title", "ai", "review", { selector: "title", box: null, aiReason: AI_FREE_TEXT }));
  for (const pg of ids.slice(2, 4)) fs.push(f(pg, "6.4.2", "ai-title", "ai", "review", { selector: "title", box: null, aiReason: "[규칙 판정] 제목이 페이지 내용을 설명하는지 확인이 필요합니다." }));
  // 이미지: 선택자 3개 × 페이지 3개 = 9곳, AI 해석 3 + 규칙 대체 6
  for (let s = 0; s < 3; s++)
    for (const pg of ids.slice(0, 3))
      fs.push(f(pg, "5.1.1", "ai-image", "ai", "review", { selector: `a:nth-of-type(${s + 1}) > img`, aiReason: pg === ids[0] ? `[AI:alt_matches] 그림 속 글자 "민원 신청"` : "[규칙 판정] 대체 텍스트가 이미지와 맞는지 사람이 확인해야 합니다 (AI 미사용).", aiSuggestion: "이미지에 대한 설명을 좀 더 자세하고 풍부하게 작성하는 것이 좋겠습니다." }));
  // axe 원문 메시지
  for (const pg of ids.slice(0, 3)) fs.push(f(pg, "5.4.3", "color-contrast", "auto", "review", { message: AXE_RAW, selector: "#header > div > button" }));
  return buildScanView({ ...scanRow("AI 실패 → 규칙 판정 + AI gemini/gemini-3.8-flash · 프롬프트 p1"), source: "fixture", label: "fixture" }, { ...project(), name: "예시 기관 웹 접근성 점검", baseUrl: "https://www.gov-sample.kr/main.html", aiEnabled: true }, pages, fs, [], []);
}


/**
 * 시각 QA 전용 캡처: 회색 격자와 내용 블록이 있는 1280×1400 화면.
 * 흰 화면이면 캡처 경계·빈 공간이 눈에 안 띄어 배치 결함을 놓친다. 보고서 산출물 코드에서는 쓰지 않는다 (테스트·QA 스크립트 전용).
 */
export async function qaShot(): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const W = 1280;
  const H = 1400;
  const grid: string[] = [];
  for (let x = 0; x <= W; x += 80) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#D5D9E0" stroke-width="1"/>`);
  for (let y = 0; y <= H; y += 80) grid.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#D5D9E0" stroke-width="1"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#F4F6F9"/>${grid.join("")}
    <rect x="0" y="0" width="${W}" height="110" fill="#1E44C8"/>
    <rect x="60" y="200" width="300" height="300" rx="24" fill="#0B5FA5"/><rect x="420" y="200" width="300" height="300" rx="24" fill="#0B8FB5"/><rect x="780" y="200" width="300" height="300" rx="24" fill="#0BA58F"/>
    <rect x="40" y="600" width="1200" height="420" fill="#FFFFFF" stroke="#C4CAD4"/>
    <rect x="80" y="660" width="520" height="24" fill="#9AA3B2"/><rect x="80" y="710" width="760" height="24" fill="#B6BDC9"/><rect x="80" y="760" width="640" height="24" fill="#B6BDC9"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
