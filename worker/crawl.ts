// 공개 사이트 주소 수집: sitemap.xml 을 먼저 보고, 없으면 링크를 따라간다 (HTML 만 받아 빠르게).

import { normalizeUrl, sameSite, type CrawlEntry } from "../src/lib/sampling";
import { DANGER_URL } from "./browser";
import { guardedGet } from "./egress-proxy";
import { parseRobots, robotsAllows, type RobotsRules } from "../src/lib/robots";

/** 요청 사이 최소 간격 (사이트 부담 줄이기). robots.txt 의 Crawl-delay 가 더 길면 그것 (최대 2초) */
const MIN_GAP_MS = 300;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const SKIP_EXT = /\.(pdf|hwp|hwpx|docx?|xlsx?|pptx?|zip|jpe?g|png|gif|svg|webp|mp4|mp3|avi|css|js|ico|xml|txt)(\?|$)/i;

/** HTML·XML 만 받는다. 주소·IP 검사와 리다이렉트 재검사는 guardedGet 이 한다 (SSRF 방어) */
async function get(url: string): Promise<string | null> {
  const r = await guardedGet(url, { maxBytes: 10 * 1024 * 1024, timeoutMs: 10_000 });
  if (!r || !/html|xml/.test(r.type)) return null;
  return r.body;
}

function extractLinks(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = normalizeUrl(m[1].replace(/&amp;/g, "&"), base);
    if (!url) continue;
    const alt = /alt\s*=\s*["']([^"']*)["']/i.exec(m[2])?.[1] ?? "";
    const text = `${m[2].replace(/<[^>]+>/g, " ")} ${alt}`.replace(/\s+/g, " ").trim().slice(0, 60);
    out.push({ url, text });
  }
  return out;
}

/** 사이트의 robots.txt 규칙 (없거나 못 읽으면 제한 없음). 확장 검사의 재계획에서도 쓴다 */
export async function fetchRobots(baseUrl: string): Promise<RobotsRules> {
  const none: RobotsRules = { allow: [], disallow: [], crawlDelay: null };
  try {
    const rt = await guardedGet(new URL("/robots.txt", baseUrl).toString(), { maxBytes: 512 * 1024, timeoutMs: 5_000 });
    return rt && /text\/plain/.test(rt.type) ? parseRobots(rt.body) : none;
  } catch {
    return none;
  }
}

export async function discover(baseUrl: string, opts: { maxUrls?: number; maxDepth?: number; deadline?: number; seedUrls?: string[] } = {}): Promise<CrawlEntry[]> {
  const deadline = opts.deadline ?? Infinity;
  const maxUrls = opts.maxUrls ?? 300;
  const maxDepth = opts.maxDepth ?? 3;
  const found = new Map<string, CrawlEntry>();
  const start = normalizeUrl(baseUrl, baseUrl)!;
  found.set(start, { url: start, texts: ["홈"], depth: 0 });
  const seeds = (opts.seedUrls ?? [])
    .map((u) => normalizeUrl(u, start))
    .filter((u): u is string => Boolean(u))
    .filter((u) => sameSite(u, start) && !SKIP_EXT.test(u) && !DANGER_URL.test(u));
  for (const url of seeds) {
    if (!found.has(url) && found.size < maxUrls) found.set(url, { url, texts: ["점검자가 지정한 화면"], depth: 0 });
  }

  const robots = await fetchRobots(start);
  const gap = Math.max(MIN_GAP_MS, Math.min(2000, (robots.crawlDelay ?? 0) * 1000));
  const allowed = (url: string) => robotsAllows(robots, url);

  // sitemap.xml
  const sm = await get(new URL("/sitemap.xml", start).toString());
  if (sm && /<urlset|<sitemapindex/i.test(sm)) {
    for (const m of sm.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      const url = normalizeUrl(m[1], start);
      if (url && sameSite(url, start) && !SKIP_EXT.test(url) && allowed(url) && !found.has(url) && found.size < maxUrls) {
        found.set(url, { url, texts: [], depth: url.split("/").length - 3 });
      }
    }
  }

  // 링크 따라가기 (너비 우선)
  let frontier = [start, ...seeds];
  for (let depth = 0; depth < maxDepth && frontier.length && found.size < maxUrls; depth++) {
    const next: string[] = [];
    for (const page of frontier.slice(0, 60)) {
      if (Date.now() > deadline) break; // 주소 수집 시간 한도
      if (page !== start) await sleep(gap);
      const html = await get(page);
      if (!html) continue;
      for (const { url, text } of extractLinks(html, page)) {
        if (!sameSite(url, start) || SKIP_EXT.test(url) || DANGER_URL.test(url) || !allowed(url)) continue;
        const prev = found.get(url);
        if (prev) {
          if (text && prev.texts.length < 5 && !prev.texts.includes(text)) prev.texts.push(text);
          continue;
        }
        if (found.size >= maxUrls) break;
        found.set(url, { url, texts: text ? [text] : [], depth: depth + 1 });
        next.push(url);
      }
    }
    frontier = next;
  }
  return [...found.values()];
}
