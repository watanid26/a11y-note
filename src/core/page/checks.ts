// axe-core 가 다루지 않거나 한국 실무 기준이 다른 항목을 직접 점검한다.
// 결과는 axe 와 같은 RawResult 형태로 돌려준다.

import type { Applicability, Candidate, PageOutline, RawNode, RawResult } from "../types";
import { absoluteUrl, accessibleName, boxOf, focusableElements, hash, isVisible, selectorOf, snippetOf, textOf } from "./dom";

const NEW_WINDOW_HINT = /새\s?창|새\s?탭|새로운\s?창|new\s?(window|tab)|新しい(ウィンドウ|タブ)|別(ウィンドウ|窓)/i;
const GENERIC_LINK = /^(더\s?보기|자세히(\s?보기)?|바로\s?가기|상세\s?보기|클릭|여기|more|read more|view more|click( here)?|here|go|詳細|こちら|もっと見る|続きを読む)$/i;
const STOP_WORDS = /정지|멈춤|일시\s?정지|재생|pause|stop|play|停止|一時停止|再生/i;
const CAROUSEL_HINT = /swiper|slick|carousel|slider|bxslider|owl-|rolling|visual-?slide|banner-?slide/i;
const CAPTCHA_HINT = /captcha|recaptcha|hcaptcha|자동입력\s?방지|보안\s?문자/i;

function node(el: Element, message: string): RawNode {
  return { selector: selectorOf(el), html: snippetOf(el), box: boxOf(el), message };
}

function result(ruleId: string, outcome: RawResult["outcome"], wcag: string[], help: string, nodes: RawNode[], impact: RawResult["impact"] = "serious"): RawResult {
  return { engine: "custom", ruleId, outcome, impact, wcag, help, nodes };
}

export function customChecks(): RawResult[] {
  const out: RawResult[] = [];

  // 6.4.1 반복 영역 건너뛰기 — 첫 번째 초점 요소가 본문 바로가기 링크인지, 목적지가 실제로 있는지
  const first = focusableElements()[0] ?? document.querySelector("a[href^='#']");
  const firstHref = first?.getAttribute("href") ?? "";
  if (!first || !(first.tagName === "A" && firstHref.startsWith("#") && firstHref.length > 1)) {
    out.push(result("kr-skip-link", "violation", ["2.4.1"], "페이지 맨 앞에 본문 바로가기 링크가 없습니다.", [node(first ?? document.body, "첫 번째 초점 요소가 건너뛰기 링크가 아닙니다.")]));
  } else {
    const id = decodeURIComponent(firstHref.slice(1));
    if (!document.getElementById(id) && !document.querySelector(`a[name="${id}"]`)) {
      out.push(result("kr-skip-link", "violation", ["2.4.1"], "건너뛰기 링크의 목적지가 페이지에 없습니다.", [node(first, `#${id} 요소를 찾을 수 없습니다.`)]));
    }
  }

  // 7.2.1 새 창 열기 안내 (한국 실무 기준)
  const newWin = Array.from(document.querySelectorAll("a[target='_blank']")).filter(isVisible);
  const noHint = newWin.filter((a) => !NEW_WINDOW_HINT.test(`${accessibleName(a)} ${a.getAttribute("title") ?? ""}`));
  if (noHint.length) {
    out.push(result("kr-new-window", "violation", ["3.2.5"], "새 창으로 열리는 링크에 \"새 창\" 안내가 없습니다.", noHint.slice(0, 50).map((a) => node(a, `링크 \"${accessibleName(a) || "(이름 없음)"}\" — title=\"새 창\" 등의 안내가 필요합니다.`)), "moderate"));
  }

  // 6.4.3 목적을 알 수 없는 링크 문구 — 문맥이 있으면 괜찮으므로 "확인 필요"
  const generic = Array.from(document.querySelectorAll("a[href]"))
    .filter(isVisible)
    .filter((a) => !a.getAttribute("aria-label") && !a.getAttribute("aria-labelledby") && GENERIC_LINK.test(accessibleName(a)));
  if (generic.length) {
    out.push(result("kr-generic-link", "incomplete", ["2.4.4"], "\"더보기\"처럼 목적을 알기 어려운 링크 문구가 있습니다.", generic.slice(0, 50).map((a) => node(a, `\"${accessibleName(a)}\" 링크의 목적이 문맥으로 드러나는지 확인이 필요합니다.`)), "moderate"));
  }

  // 5.4.2 자동 재생 — 소리가 나는 미디어가 자동 재생되는지
  const autoplay = Array.from(document.querySelectorAll<HTMLMediaElement>("video, audio")).filter(
    (m) => (m.autoplay || (!m.paused && m.currentTime > 0)) && !m.muted,
  );
  if (autoplay.length) {
    out.push(result("kr-autoplay", "violation", ["1.4.2"], "소리가 나는 미디어가 자동 재생됩니다.", autoplay.map((m) => node(m, "autoplay 이고 음소거(muted)가 아닙니다."))));
  }

  // 6.1.3 조작 가능 — 대각선 6mm(≈22.7px) 미만 컨트롤. 문장 속 인라인 링크는 제외
  const small = Array.from(
    document.querySelectorAll("button, input[type=checkbox], input[type=radio], input[type=button], input[type=submit], [role=button], a[href]"),
  )
    .filter(isVisible)
    .filter((el) => {
      // 건너뛰기 링크는 평소 1×1px로 숨겼다가 키보드 초점 시 표시하는 구현이 흔하다.
      // 초기 화면의 크기만으로 6.1.3 위반 후보를 만들지 않고, kr-skip-link의 초점 확인에서 판단한다.
      if (el.tagName === "A" && (el.getAttribute("href") ?? "").startsWith("#") && isSkipLinkText(`${accessibleName(el)} ${el.id} ${el.className}`)) return false;
      const r = targetRect(el);
      const inline = getComputedStyle(el).display === "inline" && el.parentElement && /^(P|LI|TD|SPAN|DD)$/.test(el.parentElement.tagName);
      return !inline && belowKwcagTarget(r.width, r.height);
    });
  if (small.length) {
    out.push(result("kr-small-target", "violation", ["2.5.8"], "누를 수 있는 컨트롤이 너무 작습니다 (대각선 6mm 미만).", small.slice(0, 50).map((el) => {
      const r = targetRect(el);
      return node(el, `크기 ${Math.round(r.width)}×${Math.round(r.height)}px`);
    }), "moderate"));
  }

  // 5.3.1 데이터 표 캡션 (한국 실무: 데이터 표에 caption 필수)
  const dataTables = Array.from(document.querySelectorAll("table")).filter(
    (t) => isVisible(t) && t.getAttribute("role") !== "presentation" && t.getAttribute("role") !== "none" && (t.querySelector("th") || t.rows.length > 1),
  );
  const noCaption = dataTables.filter((t) => !t.querySelector("caption")?.textContent?.trim() && !t.getAttribute("aria-label") && !t.getAttribute("aria-labelledby"));
  if (noCaption.length) {
    out.push(result("kr-table-caption", "violation", ["1.3.1"], "데이터 표에 제목(caption)이 없습니다.", noCaption.map((t) => node(t, "caption 요소로 표의 제목·내용 요약을 제공해야 합니다.")), "moderate"));
  }

  // 6.2.2 자동 슬라이드 정지 기능
  for (const c of findCarousels()) {
    const controls = Array.from(c.querySelectorAll("button, a, [role=button]")).filter((b) => STOP_WORDS.test(`${accessibleName(b)} ${b.className}`));
    if (!controls.length) {
      out.push(result("kr-carousel-stop", "incomplete", ["2.2.2"], "자동으로 넘어가는 슬라이드에 정지 버튼이 보이지 않습니다.", [node(c, "자동 전환 여부와 정지·이전·다음 버튼을 확인해야 합니다.")]));
    }
  }

  // 7.3.3 캡차
  const captchas = findCaptchas();
  if (captchas.length) {
    out.push(result("kr-captcha", "incomplete", ["3.3.8"], "캡차(자동입력 방지)가 있습니다. 대체 수단이 있는지 확인이 필요합니다.", captchas.map((c) => node(c, "음성 캡차 등 대체 수단이 필요합니다."))));
  }

  // 6.1.1 마우스로만 누를 수 있는 요소 (onclick 이 붙었지만 키보드 초점을 못 받는 div·span 등)
  const clickOnly = Array.from(document.querySelectorAll("[onclick]"))
    .filter(isVisible)
    .filter((el) => !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL|OPTION)$/.test(el.tagName))
    .filter((el) => el.getAttribute("tabindex") === null && !el.closest("a, button"));
  if (clickOnly.length) {
    out.push(result("kr-click-only", "violation", ["2.1.1"], "마우스로만 실행되는 요소가 있습니다 (키보드로 접근 불가).", clickOnly.slice(0, 30).map((el) => node(el, `<${el.tagName.toLowerCase()}> 에 onclick 만 있고 초점을 받을 수 없습니다. button 이나 a 로 바꾸세요.`))));
  }

  // 6.2.1 자동 새로고침
  const refresh = document.querySelector("meta[http-equiv='refresh' i]");
  const refreshSec = Number((refresh?.getAttribute("content") ?? "").split(";")[0]);
  if (refresh && refreshSec > 0) {
    out.push(result("kr-meta-refresh", "violation", ["2.2.1"], "페이지가 시간 제한으로 자동 새로고침·이동됩니다.", [node(refresh, `${refreshSec}초 후 자동 새로고침`)]));
  }

  // 8.1.1 / JIS 4.1.1 중복 id — axe-core 4.14 에서 duplicate-id 규칙이 폐지(obsolete)되어 직접 확인한다.
  // KWCAG 2.2 "마크업 오류 방지" 와 JIS X 8341-3:2016(WCAG 2.0) "構文解析" 은 여전히 요구한다.
  const seenId = new Map<string, Element[]>();
  document.querySelectorAll("[id]").forEach((el) => {
    const id = el.getAttribute("id") ?? "";
    if (!id.trim()) return;
    seenId.set(id, [...(seenId.get(id) ?? []), el]);
  });
  const dups = [...seenId.entries()].filter(([, els]) => els.length > 1);
  if (dups.length) {
    out.push(result("kr-duplicate-id", "violation", ["4.1.1"], "같은 id 를 여러 요소가 씁니다.", dups.slice(0, 30).map(([id, els]) => node(els[1], `id="${id}" 가 ${els.length}번 쓰였습니다.`)), "moderate"));
  }

  return out;
}

function findCarousels(): Element[] {
  const found = new Set<Element>();
  document.querySelectorAll("[aria-roledescription]").forEach((el) => {
    if (/carousel|slide|슬라이드|캐러셀/i.test(el.getAttribute("aria-roledescription") ?? "")) found.add(el);
  });
  document.querySelectorAll("[class]").forEach((el) => {
    if (CAROUSEL_HINT.test(el.className.toString()) && el.children.length >= 1 && isVisible(el)) {
      // 바깥쪽 컨테이너 하나만 남긴다
      if (![...found].some((f) => f.contains(el))) found.add(el);
    }
  });
  return [...found].filter((el) => ![...found].some((o) => o !== el && o.contains(el))).slice(0, 10);
}

function findCaptchas(): Element[] {
  const list: Element[] = [];
  document.querySelectorAll("iframe, img, input, div").forEach((el) => {
    const s = `${el.getAttribute("src") ?? ""} ${el.getAttribute("alt") ?? ""} ${el.id} ${el.getAttribute("name") ?? ""} ${el.getAttribute("class") ?? ""}`;
    if (CAPTCHA_HINT.test(s) && isVisible(el) && !list.some((p) => p.contains(el))) list.push(el);
  });
  return list.slice(0, 5);
}

/** AI 가 판단할 후보 (규칙만으로는 적절성을 알 수 없는 것) */
export function collectCandidates(results: RawResult[]): Candidate[] {
  const out: Candidate[] = [];
  const contextOf = (el: Element) => textOf(el.closest("figure, li, article, section, td, p, div") ?? el.parentElement ?? el, 160);

  // 이미지: 대체 텍스트가 있는 의미 있는 이미지, 또는 alt="" 인데 큰 이미지
  Array.from(document.images)
    .filter((img) => isVisible(img) && img.getAttribute("role") !== "presentation")
    .filter((img) => img.hasAttribute("alt"))
    .filter((img) => (img.getAttribute("alt") ?? "").trim() !== "" || (img.width >= 120 && img.height >= 80))
    .slice(0, 30)
    .forEach((img) =>
      out.push({
        kind: "image",
        selector: selectorOf(img),
        box: boxOf(img),
        text: { alt: img.getAttribute("alt") ?? "", src: img.currentSrc || img.src, context: contextOf(img), link: img.closest("a") ? accessibleName(img.closest("a")!) : "" },
      }),
    );

  // 목적이 불분명한 링크
  const genericSelectors = new Set(results.filter((r) => r.ruleId === "kr-generic-link").flatMap((r) => r.nodes.map((n) => n.selector)));
  document.querySelectorAll("a[href]").forEach((a) => {
    const sel = selectorOf(a);
    if (!genericSelectors.has(sel)) return;
    out.push({ kind: "link", selector: sel, box: boxOf(a), text: { name: accessibleName(a), href: a.getAttribute("href") ?? "", context: contextOf(a) } });
  });

  // 페이지 제목과 대표 제목
  const h1 = document.querySelector("h1");
  out.push({
    kind: "title",
    selector: "title",
    box: null,
    text: {
      title: document.title,
      h1: h1 ? textOf(h1) : "",
      headings: Array.from(document.querySelectorAll("h1, h2, h3")).slice(0, 15).map((h) => `${h.tagName}:${textOf(h, 60)}`).join(" | "),
      url: location.href,
    },
  });

  // 캡션이 있는 표 → 캡션이 내용을 설명하는지
  document.querySelectorAll("table").forEach((t) => {
    const cap = t.querySelector("caption")?.textContent?.trim();
    if (!cap || !isVisible(t)) return;
    const head = Array.from(t.querySelectorAll("th")).slice(0, 8).map((th) => textOf(th, 30)).join(", ");
    out.push({ kind: "table", selector: selectorOf(t), box: boxOf(t), text: { caption: cap, headers: head } });
  });

  for (const c of findCarousels()) out.push({ kind: "carousel", selector: selectorOf(c), box: boxOf(c), text: { controls: Array.from(c.querySelectorAll("button, a")).slice(0, 10).map((b) => accessibleName(b)).join(" | ") } });
  for (const c of findCaptchas()) out.push({ kind: "captcha", selector: selectorOf(c), box: boxOf(c), text: { around: contextOf(c) } });
  document.querySelectorAll("video, audio").forEach((m) => {
    if (!isVisible(m)) return;
    out.push({ kind: "media", selector: selectorOf(m), box: boxOf(m), text: { tracks: Array.from(m.querySelectorAll("track")).map((t) => t.getAttribute("kind") ?? "").join(","), context: contextOf(m) } });
  });
  return out;
}

export function applicability(): Applicability {
  const vis = (sel: string) => Array.from(document.querySelectorAll(sel)).filter(isVisible).length;
  const bodyText = (document.body?.innerText ?? "").slice(0, 20000);
  return {
    images: vis("img, [role=img], svg[role=img], input[type=image]"),
    media: vis("video, audio, iframe[src*='youtube'], iframe[src*='vimeo']"),
    tables: vis("table:not([role=presentation])"),
    forms: vis("form"),
    inputs: vis("input:not([type=hidden]), select, textarea"),
    links: vis("a[href]"),
    newWindowLinks: vis("a[target='_blank']"),
    carousels: findCarousels().length,
    captchas: findCaptchas().length,
    iframes: vis("iframe"),
    timeLimitHint: Boolean(document.querySelector("meta[http-equiv='refresh' i]")) || /남은\s?시간|세션.{0,6}(만료|연장)|자동\s?로그아웃|残り時間|セッション/.test(bodyText),
    accessKeys: document.querySelectorAll("[accesskey]").length,
  };
}

export function outline(): PageOutline {
  const navRoots = Array.from(document.querySelectorAll("nav, header, [role=navigation], #gnb, .gnb, #lnb, .lnb, #header, .header, footer"));
  const seen = new Set<string>();
  const navLinks: PageOutline["navLinks"] = [];
  for (const root of navRoots) {
    root.querySelectorAll("a[href]").forEach((a) => {
      const href = absoluteUrl(a.getAttribute("href") ?? "");
      const text = accessibleName(a);
      if (!text || seen.has(href) || href.startsWith("javascript:")) return;
      seen.add(href);
      if (navLinks.length < 120) navLinks.push({ text: text.slice(0, 40), href });
    });
  }
  const forms: PageOutline["forms"] = Array.from(document.querySelectorAll("form"))
    .filter(isVisible)
    .slice(0, 10)
    .map((f) => {
      const fields = Array.from(f.querySelectorAll("input:not([type=hidden]), select, textarea"));
      const has = (re: RegExp) => fields.some((i) => re.test(`${i.getAttribute("type")} ${i.getAttribute("name")} ${i.id} ${i.getAttribute("placeholder")} ${i.getAttribute("aria-label")}`));
      const submit = f.querySelector("button[type=submit], input[type=submit], button:not([type])");
      let kind: PageOutline["forms"][number]["kind"] = "other";
      if (has(/password/i) && fields.length <= 4) kind = "login";
      else if (has(/password/i)) kind = "signup";
      else if (has(/search|검색|keyword|query|\bq\b|検索/i) && fields.length <= 3) kind = "search";
      else if (f.querySelector("textarea")) kind = "contact";
      return { selector: selectorOf(f), kind, fields: fields.length, submitText: submit ? accessibleName(submit) || (submit as HTMLInputElement).value || "" : "" };
    });
  const search = document.querySelector<HTMLInputElement>("input[type=search], input[name*=search i], input[name=q], input[name*=keyword i], input[placeholder*=검색], input[title*=검색], input[aria-label*=검색], input[placeholder*=検索]");
  return { navLinks, forms, searchInput: search && isVisible(search) ? selectorOf(search) : null };
}

/** DOM 뼈대 서명: 태그와 첫 클래스만 깊이 4까지. 글 내용이 달라도 틀이 같으면 같은 값 */
export function templateSignature(): string {
  const walk = (el: Element, depth: number): string => {
    if (depth > 4) return "";
    const cls = (el.getAttribute("class") ?? "").split(/\s+/)[0] ?? "";
    const kids = Array.from(el.children)
      .filter((c) => !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|svg)$/i.test(c.tagName))
      .slice(0, 12)
      .map((c) => walk(c, depth + 1))
      .join(",");
    return `${el.tagName.toLowerCase()}${cls ? `.${cls.replace(/[0-9]+/g, "")}` : ""}(${kids})`;
  };
  return hash(document.body ? walk(document.body, 0) : "");
}

/** KWCAG 2.2 6.1.3: 컨트롤의 대각선 길이 6.0mm(96dpi 기준 약 22.7px) 이상.
 *  WCAG 2.5.8(24×24px 또는 간격)과 기준이 다르다 — 그쪽은 axe 의 target-size 규칙이 따로 본다 (Codex 리뷰 8) */
export const KWCAG_TARGET_DIAGONAL_PX = (6 / 25.4) * 96;
/** 건너뛰기 링크 이름: 본문·주메뉴·전체메뉴·메인메뉴 바로가기, skip 등 (공공기관 실사용 시험 2026-10-26) */
export function isSkipLinkText(text: string): boolean {
  return /skip|accessibility|본문|(?:주|주요|전체|메인|상단|하단)\s*메뉴|메뉴\s*바로\s*가기|건너뛰기|바로\s*가기/i.test(text);
}

/**
 * 실제로 누르는 영역. 체크박스·라디오를 1×1 등으로 숨기고 label 을 대신 보여 주는 구현이 흔하므로,
 * 연결된 label 이 보이면 입력 요소와 label 을 합친 영역으로 잰다 (label 클릭도 같은 컨트롤을 조작한다).
 */
function targetRect(el: Element): { width: number; height: number } {
  const r = el.getBoundingClientRect();
  const labels = (el as HTMLInputElement).labels;
  if (!(el instanceof HTMLInputElement) || !labels?.length) return r;
  let { left, top, right, bottom } = r;
  for (const l of Array.from(labels)) {
    const b = l.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) continue;
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.right);
    bottom = Math.max(bottom, b.bottom);
  }
  return { width: right - left, height: bottom - top };
}

export function belowKwcagTarget(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false; // 크기를 잴 수 없는 요소는 판단하지 않음
  return Math.hypot(width, height) < KWCAG_TARGET_DIAGONAL_PX;
}
