// 브라우저 안에서 쓰는 DOM 도우미. (서버 워커의 Playwright 와 크롬 확장이 같은 번들을 주입한다)

import type { Box } from "../types";

export function isVisible(el: Element): boolean {
  const he = el as HTMLElement;
  if (!he.isConnected) return false;
  const style = getComputedStyle(he);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (Number(style.opacity) === 0) return false;
  const r = he.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** 페이지 전체 기준 좌표 (전체 화면 캡처와 맞추기 위해 스크롤 위치를 더한다) */
export function boxOf(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    x: Math.round(r.left + window.scrollX),
    y: Math.round(r.top + window.scrollY),
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
}

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/** 사람이 읽을 수 있고 페이지 안에서 하나로 정해지는 CSS 선택자 */
export function selectorOf(el: Element): string {
  if (el.id && document.querySelectorAll(`#${cssEscape(el.id)}`).length === 1) return `#${cssEscape(el.id)}`;
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
    if (cur.id && document.querySelectorAll(`#${cssEscape(cur.id)}`).length === 1) {
      parts.unshift(`#${cssEscape(cur.id)}`);
      break;
    }
    const tag = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
    cur = parent;
    if (parts.length > 8) break;
  }
  return parts.join(" > ");
}

/** 요소의 시작 태그 위주 짧은 HTML. 입력값은 지운다 (개인정보 보호) */
export function snippetOf(el: Element, max = 300): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll?.("input, textarea").forEach((n) => {
    n.removeAttribute("value");
    if (n.tagName === "TEXTAREA") n.textContent = "";
  });
  if ((clone as Element).tagName === "INPUT") clone.removeAttribute("value");
  const html = (clone as HTMLElement).outerHTML ?? "";
  return html.length > max ? `${html.slice(0, max)}…` : html;
}

export function textOf(el: Element, max = 120): string {
  const t = ((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 링크·버튼의 접근 가능한 이름 (간이 계산) */
export function accessibleName(el: Element): string {
  const label = el.getAttribute("aria-label");
  if (label?.trim()) return label.trim();
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const t = by
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (t) return t;
  }
  const own = textOf(el, 200);
  const alts = Array.from(el.querySelectorAll("img[alt]"))
    .map((i) => i.getAttribute("alt") ?? "")
    .join(" ")
    .trim();
  const name = [own, alts].filter(Boolean).join(" ").trim();
  if (name) return name;
  return (el.getAttribute("title") ?? "").trim();
}

const FOCUSABLE =
  'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [tabindex], [contenteditable="true"], audio[controls], video[controls]';

export function focusableElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    const ti = el.getAttribute("tabindex");
    if (ti !== null && Number(ti) < 0) return false;
    return isVisible(el);
  });
}

export function absoluteUrl(href: string): string {
  try {
    return new URL(href, location.href).toString();
  } catch {
    return href;
  }
}

/** 간단한 문자열 해시 (같은 틀 페이지 묶기용) */
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
