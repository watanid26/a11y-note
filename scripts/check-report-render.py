#!/usr/bin/env python3
"""보고서 렌더 품질 게이트 (Codex 보고서 리뷰 4).

사용: python3 scripts/check-report-render.py 점검보고서.docx 점검보고서.pdf [출력폴더]
 - DOCX XML 검사: 머리글 행 반복 설정, 빈 표 칸, 한국어 글꼴 지정
 - PDF 검사(DOCX 를 LibreOffice 로 렌더한 결과): 쪽번호, 한글 글리프, 빈 페이지,
   캡처가 페이지 경계에서 잘렸는지, 캡처와 설명이 같은 쪽에 있는지, 표 밖 텍스트(본문 영역 밖) 여부
 - 모든 페이지를 PNG 로 저장해 눈으로 확인할 수 있게 한다 (출력폴더/page-NN.png, contact-N.png)
결과를 JSON 으로 출력하고, 문제가 있으면 종료 코드 1.
"""
import json
import re
import sys
import zipfile
from pathlib import Path

import pymupdf

docx_path, pdf_path = Path(sys.argv[1]), Path(sys.argv[2])
out_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else None
problems: list[str] = []
info: dict = {}

# ── DOCX XML ──
xml = zipfile.ZipFile(docx_path).read("word/document.xml").decode("utf-8")
styles = zipfile.ZipFile(docx_path).read("word/styles.xml").decode("utf-8")
tables = re.findall(r"<w:tbl>.*?</w:tbl>", xml, re.S)
info["docx_tables"] = len(tables)
info["docx_tables_with_repeat_header"] = sum(1 for t in tables if "<w:tblHeader/>" in t or '<w:tblHeader w:val="true"/>' in t or "<w:tblHeader" in t)
empty_cells = 0
for t in tables:
    for tc in re.findall(r"<w:tc>.*?</w:tc>", t, re.S):
        text = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", tc))
        if not text.strip() and "<w:drawing>" not in tc:
            empty_cells += 1
info["docx_empty_cells"] = empty_cells
if empty_cells:
    problems.append(f"빈 표 칸 {empty_cells}개")
if not any(f in styles for f in ("맑은 고딕", "Malgun Gothic", "Noto Sans CJK KR", "Meiryo")):
    problems.append("한국어(또는 일본어) 글꼴 지정 없음")
info["docx_font"] = re.findall(r'w:eastAsia="([^"]+)"', styles)[:1]

# 페이지 여백 (DOCX sectPr, twip → pt). 본문·캡처는 이 안전영역 안에 있어야 하고 꼬리말과 겹치면 안 된다
pg = re.search(r"<w:pgMar ([^>]*)/>", xml)
def _mar(k, d):
    m = re.search(rf'w:{k}="(\d+)"', pg.group(1)) if pg else None
    return int(m.group(1)) / 20 if m else d
MARGIN_TOP, MARGIN_BOTTOM, FOOTER_DIST = _mar("top", 60), _mar("bottom", 55), _mar("footer", 28)
info["page_margin_pt"] = {"top": MARGIN_TOP, "bottom": MARGIN_BOTTOM, "footer": FOOTER_DIST}
SAFE = 4  # pt 허용 오차
footer_issues = []
safe_issues = []

# ── PDF ──
doc = pymupdf.open(pdf_path)
n = len(doc)
info["pdf_pages"] = n
hangul_pages = 0
bad_glyph_pages = []
fig_issues = []
pagenum_issues = []
blank_pages = []
outside_text = []
fonts = set()
for i, page in enumerate(doc):
    h, w = page.rect.height, page.rect.width
    text = page.get_text()
    if re.search(r"[가-힣]", text):
        hangul_pages += 1
    if "�" in text:
        bad_glyph_pages.append(i + 1)
    for f in page.get_fonts():
        fonts.add(f[3])
    # 쪽번호 "N / M" (꼬리말): 정확한 글자, 페이지 안에 완전히 들어오고, 본문·그림과 겹치지 않음
    blocks = page.get_text("blocks")
    body_limit = h - MARGIN_BOTTOM
    foot = [b for b in blocks if b[1] > body_limit - SAFE and re.fullmatch(r"\s*\d+\s*/\s*\d+\s*", b[4])]
    foot_text = " ".join(b[4] for b in foot)
    mm = re.fullmatch(r"\s*(\d+)\s*/\s*(\d+)\s*", foot_text)
    if not mm or int(mm.group(1)) != i + 1 or int(mm.group(2)) != n:
        pagenum_issues.append(i + 1)
    else:
        fb = foot[0]
        if fb[3] > h - 5:
            footer_issues.append(f"{i + 1}쪽 꼬리말이 페이지 아래로 잘림")
        others = [b for b in blocks if b is not fb and b[4].strip()] + [(*im["bbox"], "img") for im in page.get_image_info()]
        for b in others:
            if b[3] > fb[1] - 2 and b[1] < fb[3]:
                footer_issues.append(f"{i + 1}쪽 꼬리말과 본문/그림 겹침")
                break
    # 본문 안전영역: 머리글·꼬리말 영역을 침범하지 않음
    for b in blocks:
        if not b[4].strip() or b in foot:
            continue
        if b[1] > MARGIN_TOP - SAFE and b[3] > body_limit + SAFE:
            safe_issues.append(f"{i + 1}쪽 본문이 아래 안전영역 침범 (y={round(b[3])} > {round(body_limit)})")
            break
    body = [b for b in page.get_text("blocks") if 60 < b[1] < h - 60 and b[4].strip()]
    imgs = page.get_image_info()
    if not body and not imgs:
        blank_pages.append(i + 1)
    # 본문 영역 밖(좌우 여백 밖) 텍스트
    for b in page.get_text("blocks"):
        if b[4].strip() and (b[0] < 20 or b[2] > w - 20):
            outside_text.append(i + 1)
            break
    # 캡처: 페이지 안에 다 들어가는지, 바로 아래에 설명("그림 …")이 있는지
    for im in imgs:
        x0, y0, x1, y1 = im["bbox"]
        if y0 < MARGIN_TOP - SAFE or y1 > h - MARGIN_BOTTOM + SAFE or x0 < 0 or x1 > w:
            fig_issues.append(f"{i + 1}쪽 이미지 경계 밖 {tuple(round(v) for v in im['bbox'])}")
            continue
        below = [b for b in page.get_text("blocks") if b[1] >= y1 - 2 and b[1] <= y1 + 40 and re.search(r"(그림|図) P-\d+", b[4])]
        if not below:
            fig_issues.append(f"{i + 1}쪽 이미지 아래 설명 없음 {tuple(round(v) for v in im['bbox'])}")
info.update(
    pdf_hangul_pages=hangul_pages,
    pdf_fonts=sorted(fonts),
    pdf_bad_glyph_pages=bad_glyph_pages,
    pdf_pagenum_issues=pagenum_issues,
    pdf_blank_pages=blank_pages,
    pdf_outside_text_pages=sorted(set(outside_text)),
    pdf_figure_issues=fig_issues,
    pdf_footer_issues=footer_issues,
    pdf_safe_area_issues=safe_issues,
    pdf_images=sum(len(p.get_image_info()) for p in doc),
)
if bad_glyph_pages:
    problems.append(f"깨진 글자(U+FFFD) 쪽: {bad_glyph_pages}")
if hangul_pages < max(1, n - 2):
    problems.append(f"한글이 보이는 쪽이 적음 ({hangul_pages}/{n})")
if pagenum_issues:
    problems.append(f"쪽번호 오류 쪽: {pagenum_issues}")
if blank_pages:
    problems.append(f"빈 페이지: {blank_pages}")
if outside_text:
    problems.append(f"본문 영역 밖 텍스트 쪽: {sorted(set(outside_text))}")
problems += fig_issues + footer_issues + safe_issues

# ── 모든 페이지 PNG ──
if out_dir:
    out_dir.mkdir(parents=True, exist_ok=True)
    from PIL import Image

    files = []
    for i, page in enumerate(doc):
        p = out_dir / f"page-{i + 1:02d}.png"
        page.get_pixmap(dpi=60).save(p)
        files.append(p)
    for k in range(0, len(files), 12):
        chunk = [Image.open(f) for f in files[k : k + 12]]
        cw, ch = chunk[0].size
        sheet = Image.new("RGB", (cw * 6, ch * 2), "white")
        for j, im in enumerate(chunk):
            sheet.paste(im, ((j % 6) * cw, (j // 6) * ch))
        sheet.save(out_dir / f"contact-{k // 12 + 1}.png")
    info["png_dir"] = str(out_dir)

info["problems"] = problems
print(json.dumps(info, ensure_ascii=False, indent=1))
sys.exit(1 if problems else 0)
