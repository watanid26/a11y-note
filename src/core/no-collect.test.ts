// 점검 대상 사이트의 쿠키·세션·저장소 값을 읽지 않는다는 것을 코드 수준에서 고정 (P0-9).
// 페이지 안에서 도는 코드(점검 엔진·녹화 스크립트)와 확장 백그라운드가 대상.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..");
const files = [
  ...readdirSync(path.join(root, "src", "core", "page")).map((f) => path.join("src", "core", "page", f)),
  "extension/recorder.js",
  "extension/background.js",
  "extension/sidepanel.js",
].filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith(".test.ts"));

const FORBIDDEN: [RegExp, string][] = [
  [/document\.cookie/, "페이지 쿠키"],
  [/chrome\.cookies/, "브라우저 쿠키 API"],
  [/\blocalStorage\b/, "페이지 localStorage"],
  [/\bsessionStorage\b/, "페이지 sessionStorage"],
  [/\bindexedDB\b/, "페이지 IndexedDB"],
  [/Network\.(getCookies|getAllCookies)|Storage\.getCookies/, "디버거로 쿠키 읽기"],
  [/\.value\s*[,)}]/, "입력칸 값 읽기 (녹화 스크립트의 선택 상자 예외는 아래에서 허용)"],
];

describe("점검 대상 사이트의 쿠키·세션·입력값을 읽지 않음", () => {
  it("대상 파일이 있음 (테스트 전제)", () => expect(files.length).toBeGreaterThan(4));
  for (const f of files) {
    const src = readFileSync(path.join(root, f), "utf8");
    for (const [re, what] of FORBIDDEN) {
      it(`${f}: ${what} 없음`, () => {
        let hits = src.split("\n").filter((l) => re.test(l));
        // 허용 예외: 녹화 스크립트는 선택 상자(SELECT)의 선택값만 단계 기록에 남긴다 (자유 입력값은 "{{입력값}}" 로 가림)
        if (what.startsWith("입력칸") && f === "extension/recorder.js") hits = hits.filter((l) => !/el\.tagName === "SELECT" \? el\.value|el\.value \|\| el\.getAttribute\("title"\)/.test(l));
        // 사이드 패널은 확장 자신의 설정 입력칸만 읽는다
        if (what.startsWith("입력칸") && f === "extension/sidepanel.js") hits = [];
        expect(hits, hits.join("\n")).toEqual([]);
      });
    }
  }
});
