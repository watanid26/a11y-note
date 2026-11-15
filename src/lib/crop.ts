// 캡처에서 문제 요소 부분만 잘라낸다 (AI 판정 입력, 보고서·검토 화면용).
// 좌표: 요소 위치(페이지 기준) × 캡처 배율 − 캡처 시작 위치(확장은 보이는 영역만 찍으므로)

import sharp from "sharp";
import type { Box } from "../core/types";

export async function cropBox(
  png: Buffer,
  box: Box,
  opts: { scale?: number; origin?: { x: number; y: number } | null; pad?: number; maxWidth?: number } = {},
): Promise<Buffer | null> {
  const scale = opts.scale ?? 1;
  const pad = opts.pad ?? 12;
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const ox = opts.origin?.x ?? 0;
  const oy = opts.origin?.y ?? 0;
  let left = Math.floor((box.x - ox) * scale) - pad;
  let top = Math.floor((box.y - oy) * scale) - pad;
  let width = Math.ceil(box.w * scale) + pad * 2;
  let height = Math.ceil(box.h * scale) + pad * 2;
  left = Math.max(0, left);
  top = Math.max(0, top);
  width = Math.min(width, W - left);
  height = Math.min(height, H - top);
  if (width < 4 || height < 4) return null;
  // 너무 큰 영역은 위쪽만
  height = Math.min(height, 1200);
  return sharp(png)
    .extract({ left, top, width, height })
    .resize({ width: Math.min(width, opts.maxWidth ?? 900), withoutEnlargement: true })
    .png()
    .toBuffer();
}

/** 캡처 위에 오류 위치를 빨간 상자로 표시한 축소 이미지.
 *  window 를 주면 첫 상자 둘레만 그 높이로 잘라 보여 준다 (긴 전체 페이지 캡처용) */
export async function highlight(
  png: Buffer,
  boxes: Box[],
  opts: { scale?: number; origin?: { x: number; y: number } | null; maxWidth?: number; window?: number } = {},
): Promise<Buffer> {
  const scale = opts.scale ?? 1;
  const ox = opts.origin?.x ?? 0;
  const oy = opts.origin?.y ?? 0;
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  const rects = boxes
    .map((b) => `<rect x="${(b.x - ox) * scale}" y="${(b.y - oy) * scale}" width="${b.w * scale}" height="${b.h * scale}" fill="none" stroke="#e11d48" stroke-width="${Math.max(4, Math.round(4 * scale))}"/>`)
    .join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects}</svg>`);
  // sharp 는 한 파이프라인에서 resize 를 composite 보다 먼저 하므로, 합성 결과를 먼저 버퍼로 만든다
  let out = await sharp(png).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
  const win = opts.window ? Math.round(opts.window * scale) : 0;
  if (win && H > win && boxes[0]) {
    const b = boxes[0];
    const cy = ((b.y - oy) + b.h / 2) * scale;
    const top = Math.max(0, Math.min(H - win, Math.round(cy - win / 2)));
    out = await sharp(out).extract({ left: 0, top, width: W, height: win }).png().toBuffer();
  }
  return sharp(out)
    .resize({ width: Math.min(W, opts.maxWidth ?? 1000), withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * 보고서용 증거 이미지 두 장 (Codex 보고서 리뷰 3).
 *  - overview: 오류 위치 둘레의 화면 일부(최대 window px 높이)를 축소, 얇은 주황·빨강 테두리와 번호 콜아웃
 *  - zoom: 문제 요소 주변만 확대 (원본 비율 유지, 2배 넘게 키우지 않음), 얇은 테두리
 * 원본 색은 바꾸지 않는다 (덮어 칠하지 않고 테두리만).
 */
export async function evidenceImages(
  png: Buffer,
  box: Box,
  opts: { scale?: number; origin?: { x: number; y: number } | null; label?: string; window?: number; width?: number; cropWidth?: number; pad?: number } = {},
): Promise<{ overview: Buffer; zoom: Buffer | null; overviewPart: boolean; region: { top: number; height: number; total: number; left: number; width: number; totalWidth: number } } | null> {
  const scale = opts.scale ?? 1;
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return null;
  const ox = opts.origin?.x ?? 0;
  const oy = opts.origin?.y ?? 0;
  const bx = (box.x - ox) * scale;
  const by = (box.y - oy) * scale;
  const bw = Math.max(2, box.w * scale);
  const bh = Math.max(2, box.h * scale);
  if (bx >= W || by >= H || bx + bw <= 0 || by + bh <= 0) return null;
  const label = (opts.label ?? "1").slice(0, 3);
  const stroke = Math.max(3, Math.round(3 * scale));
  const r = Math.round(14 * scale);
  const cx = Math.max(r + 2, Math.min(W - r - 2, bx - r));
  const cy = Math.max(r + 2, Math.min(H - r - 2, by - r));
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="#E4572E" stroke-width="${stroke}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#C8102E" stroke="#fff" stroke-width="${Math.max(2, Math.round(2 * scale))}"/>` +
      `<text x="${cx}" y="${cy + r * 0.38}" font-family="Arial, sans-serif" font-size="${Math.round(r * 1.1)}" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>` +
      `</svg>`,
  );
  const marked = await sharp(png).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();

  // 주변 화면: 오류 위치 둘레만 잘라 글자가 읽히는 배율을 유지한다 (window 높이 × cropWidth 너비)
  const win = Math.min(H, Math.round((opts.window ?? 1100) * scale));
  const centerY = by + bh / 2;
  // 번호 원형과 테두리 윗변이 잘리지 않게: 요소가 자르는 높이보다 크거나 위쪽에 걸리면 표시의 윗부분에 맞춘다
  const markTop = Math.max(0, Math.floor(Math.min(by, cy - r) - 12 * scale));
  let top = Math.max(0, Math.min(H - win, Math.round(centerY - win / 2)));
  if (markTop < top || bh + (by - markTop) > win) top = Math.max(0, Math.min(H - win, markTop));
  const cw = Math.min(W, Math.round((opts.cropWidth ?? W / scale) * scale));
  // 왼쪽 정렬 화면이 잘리지 않도록 문제 요소의 왼쪽 끝(여백 포함)에 맞춰 자른다. 요소가 왼쪽 cw 안에 있으면 화면 왼쪽 끝부터
  // 번호 원형은 요소 왼쪽 바깥에 그리므로, 요소만 기준으로 자르면 원형과
  // 주황 테두리가 화면 가장자리에서 잘릴 수 있다. 번호·테두리 전체가
  // 들어오는 안전 영역을 먼저 계산한 뒤 기존 위치 선호값을 그 안에 맞춘다.
  const safeLeft = Math.max(0, Math.floor(Math.min(bx, cx - r) - 8 * scale));
  const safeRight = Math.min(W, Math.ceil(Math.max(bx + bw, cx + r) + 8 * scale));
  const preferredLeft = bx + bw + 24 * scale <= cw ? 0 : Math.max(0, Math.min(W - cw, Math.round(bx - 24 * scale)));
  const minLeft = Math.max(0, safeRight - cw);
  const maxLeft = Math.min(W - cw, safeLeft);
  const left = minLeft <= maxLeft
    ? Math.round(Math.max(minLeft, Math.min(maxLeft, preferredLeft)))
    : preferredLeft;
  const outW = opts.width ?? 1000;
  // 위·아래가 한 가지 색(빈 화면)으로만 이어지면 그 부분을 줄인다. 표시(번호·테두리)와 내용은 남기고 여백은 최소 margin 유지
  const crop = await sharp(marked).extract({ left, top, width: cw, height: win }).png().toBuffer();
  const band = await contentRows(crop, Math.round(40 * scale), Math.round(220 * scale));
  // 내용 행만 기준으로 줄이면 요소 주변의 안내 문구가 잘려 문맥이 끊길 수 있다.
  // 강조 대상과 번호 주변에는 최소 여백을 보존해 증거 구간을 읽을 수 있게 한다.
  const context = Math.round(28 * scale);
  const boxTop = Math.max(0, Math.floor(Math.min(by, cy - r) - context) - top);
  const boxBottom = Math.min(win, Math.ceil(Math.max(by + bh, cy + r) + context) - top);
  let bandTop = Math.min(band.top, boxTop);
  let bandBottom = Math.max(band.top + band.height, boxBottom);
  bandTop = Math.max(0, bandTop);
  bandBottom = Math.min(win, bandBottom);
  const minOverview = Math.min(win, Math.round(260 * scale));
  if (bandBottom - bandTop < minOverview) {
    const need = minOverview - (bandBottom - bandTop);
    bandTop = Math.max(0, bandTop - Math.ceil(need / 2));
    bandBottom = Math.min(win, bandTop + minOverview);
    bandTop = Math.max(0, bandBottom - minOverview);
  }
  const ovTop = top + bandTop;
  const ovH = bandBottom - bandTop;
  const overview = await sharp(crop).extract({ left: 0, top: bandTop, width: cw, height: ovH }).resize({ width: Math.min(outW, cw), withoutEnlargement: true }).png().toBuffer();

  // 확대본: 요소 둘레 여백, 최소 크기 확보
  const pad = Math.round((opts.pad ?? 48) * scale);
  let zl = Math.max(0, Math.floor(bx - pad));
  let zt = Math.max(0, Math.floor(by - pad));
  let zw = Math.min(W - zl, Math.ceil(bw + pad * 2));
  let zh = Math.min(H - zt, Math.ceil(bh + pad * 2));
  const minW = Math.round(360 * scale);
  const minH = Math.round(160 * scale);
  if (zw < minW) {
    zl = Math.max(0, Math.min(W - minW, Math.round(bx + bw / 2 - minW / 2)));
    zw = Math.min(W - zl, minW);
  }
  if (zh < minH) {
    zt = Math.max(0, Math.min(H - minH, Math.round(by + bh / 2 - minH / 2)));
    zh = Math.min(H - zt, minH);
  }
  zh = Math.min(zh, Math.round(700 * scale));
  let zoom: Buffer | null = null;
  if (zw >= 8 && zh >= 8) {
    const target = Math.min(900, zw * 2);
    const zc = await sharp(marked).extract({ left: zl, top: zt, width: zw, height: zh }).png().toBuffer();
    const zb = await contentRows(zc, Math.round(32 * scale), Math.round(120 * scale));
    zoom = await sharp(zc).extract({ left: 0, top: zb.top, width: zw, height: zb.height }).resize({ width: target }).png().toBuffer();
  }
  return {
    overview,
    zoom,
    overviewPart: ovH < H || cw < W,
    region: { top: Math.round(ovTop / scale), height: Math.round(ovH / scale), total: Math.round(H / scale), left: Math.round(left / scale), width: Math.round(cw / scale), totalWidth: Math.round(W / scale) },
  };
}

/**
 * 내용이 있는 행 범위 (배경색 = 왼쪽 위 화소와 같은 색). 위·아래 빈 띠를 margin 만 남기고 줄인다.
 * minHeight 보다 작게 줄이지 않는다. 내용이 전혀 없으면 그대로 둔다.
 */
export async function contentRows(png: Buffer, margin: number, minHeight: number): Promise<{ top: number; height: number }> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const bg = [data[0], data[1], data[2]];
  const differs = (y: number) => {
    const row = y * w * c;
    for (let x = 0; x < w; x += 2) {
      const i = row + x * c;
      if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 24) return true;
    }
    return false;
  };
  let first = 0;
  while (first < h && !differs(first)) first++;
  if (first >= h) return { top: 0, height: h };
  let last = h - 1;
  while (last > first && !differs(last)) last--;
  let top = Math.max(0, first - margin);
  let bottom = Math.min(h, last + 1 + margin);
  if (bottom - top < minHeight) {
    const need = Math.min(h, minHeight) - (bottom - top);
    top = Math.max(0, top - Math.ceil(need / 2));
    bottom = Math.min(h, top + Math.max(minHeight, bottom - top));
    top = Math.max(0, bottom - Math.max(minHeight, bottom - top));
  }
  return { top, height: bottom - top };
}
