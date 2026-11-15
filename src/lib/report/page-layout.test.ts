// 페이지 안전영역 회귀 테스트 (2026-10-14 시각 검수 반영)
//  - 꼬리말 "N / 전체"가 본문에 밀려 잘리지 않도록 아래 여백·꼬리말 거리
//  - 캡처가 페이지 위쪽에 붙지 않도록 그림 칸 위 여백, 최대 크기
//  - 렌더 환경(LibreOffice + PyMuPDF)이 있으면 실제 PDF 로 꼬리말·안전영역을 확인
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { PAGE_LAYOUT, buildReport } from "./docx";
import { sampleSiteLike, qaShot } from "./sample-site-fixture";

const EMU_PER_PX = 9525; // 96dpi

async function documentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file("word/document.xml")!.async("string");
}

describe("페이지 안전영역 (DOCX 설정)", async () => {
  const buf = await buildReport(sampleSiteLike(), { loadShot: qaShot });
  const xml = await documentXml(buf);

  it("아래 여백이 꼬리말 높이보다 충분히 크고, 머리글·꼬리말 거리가 여백 안쪽", () => {
    const m = /<w:pgMar ([^>]*)\/>/.exec(xml)![1];
    const v = (k: string) => Number(new RegExp(`w:${k}="(\\d+)"`).exec(m)![1]);
    expect(v("bottom")).toBeGreaterThanOrEqual(1400); // 70pt 이상
    expect(v("bottom") - v("footer")).toBeGreaterThanOrEqual(700); // 꼬리말 위 35pt 이상 비움
    expect(v("top") - v("header")).toBeGreaterThanOrEqual(600);
  });

  it("캡처 크기가 보수적 최대값 이하 (축소본·확대본 + 설명이 한 쪽에 들어감)", () => {
    const extents = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((x) => [Number(x[1]) / EMU_PER_PX, Number(x[2]) / EMU_PER_PX]);
    expect(extents.length).toBeGreaterThan(0);
    const maxH = Math.max(PAGE_LAYOUT.overview.maxH, PAGE_LAYOUT.zoom.maxH);
    for (const [w, h] of extents) {
      expect(w).toBeLessThanOrEqual(PAGE_LAYOUT.overview.maxW + 1);
      expect(h).toBeLessThanOrEqual(maxH + 1);
    }
    // 한 쪽 본문 높이(px) 안에 축소본 + 확대본 + 설명 6줄이 들어가야 함
    const bodyPx = ((PAGE_LAYOUT.height - PAGE_LAYOUT.margin.top - PAGE_LAYOUT.margin.bottom) / 20) * (96 / 72);
    expect(PAGE_LAYOUT.overview.maxH + PAGE_LAYOUT.zoom.maxH + 6 * 20 + 80).toBeLessThan(bodyPx);
  });

  it("그림 칸에 위 여백이 있어 페이지 맨 위에 붙지 않음", () => {
    const tcMar = [...xml.matchAll(/<w:tcMar><w:top w:type="dxa" w:w="(\d+)"\/>/g)].map((x) => Number(x[1]));
    expect(tcMar.filter((t) => t >= PAGE_LAYOUT.figurePad.top).length).toBeGreaterThan(0);
  });
});

/** 렌더 도구가 있을 때만: LibreOffice 로 PDF 를 만들고 scripts/check-report-render.py 로 꼬리말·안전영역을 확인 */
function renderToolsAvailable(): boolean {
  if (spawnSync("soffice", ["--version"], { stdio: "ignore" }).status !== 0) return false;
  return spawnSync("python3", ["-c", "import pymupdf, uno"], { stdio: "ignore" }).status === 0;
}

describe.skipIf(!renderToolsAvailable())("실제 렌더 (LibreOffice + PyMuPDF)", () => {
  it(
    "모든 쪽에 꼬리말 N / 전체가 완전히 보이고, 본문·캡처가 안전영역 안에 있음",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "a11y-layout-"));
      const docx = join(dir, "r.docx");
      const pdf = join(dir, "r.pdf");
      writeFileSync(docx, await buildReport(sampleSiteLike(), { loadShot: qaShot }));
      execFileSync("python3", ["scripts/docx-to-pdf.py", docx, pdf], { stdio: "ignore", timeout: 170_000 });
      const out = spawnSync("python3", ["scripts/check-report-render.py", docx, pdf], { encoding: "utf8" });
      const res = JSON.parse(out.stdout);
      expect(res.pdf_pagenum_issues).toEqual([]);
      expect(res.pdf_footer_issues).toEqual([]);
      expect(res.pdf_safe_area_issues).toEqual([]);
      expect(res.pdf_figure_issues).toEqual([]);
    },
    200_000,
  );
});
