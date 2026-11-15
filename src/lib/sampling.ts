// 대표 페이지 고르기 (WCAG-EM 방식).
// 모든 페이지를 볼 필요는 없다: 같은 틀로 찍어낸 페이지는 하나만 보고,
// 홈·로그인·검색·문의·접근성 안내처럼 꼭 봐야 하는 페이지는 반드시 넣는다.
// (일본 공공 사양 관행: 40쪽 미만이면 전부, 그 이상이면 40쪽 + 필수 페이지)

export interface CrawlEntry {
  url: string;
  /** 이 주소를 가리킨 링크 문구들 */
  texts: string[];
  depth: number;
}

export interface Sampled {
  url: string;
  templateKey: string;
  reason: string;
  /** 같은 틀로 묶인 페이지 수 */
  groupSize: number;
}

/** 페이지 유형 (표본 구성표·유형별 커버리지). 주소·링크 문구·선정 이유로만 추정하는 초안 분류다 */
export type PageType = "메인" | "로그인·가입" | "검색" | "목록" | "상세" | "입력 폼" | "도움말·연락처" | "접근성 안내" | "사이트맵" | "기타";
export const PAGE_TYPES: PageType[] = ["메인", "로그인·가입", "검색", "목록", "상세", "입력 폼", "도움말·연락처", "접근성 안내", "사이트맵", "기타"];

export function pageType(url: string, reason: string, texts: string[] = []): PageType {
  const t = `${reason} ${texts.join(" ")}`;
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    /* 주소가 이상하면 문구로만 본다 */
  }
  if (reason === "홈" || path === "/" || /^\/(index|main)(\.\w+)?$/.test(path)) return "메인";
  if (/로그인|회원가입|login|sign\s?(in|up)|join|register/i.test(t) || /login|signin|signup|join|member\/(regist|join)/.test(path)) return "로그인·가입";
  if (/접근성/.test(t) || /accessib/.test(path)) return "접근성 안내";
  if (/사이트\s?맵|sitemap/i.test(t) || /sitemap/.test(path)) return "사이트맵";
  if (/검색|search/i.test(t) || /search/.test(path)) return "검색";
  if (/문의|고객\s?센터|상담|contact|faq|도움말|help/i.test(t) || /contact|faq|help|qna|inquiry/.test(path)) return "도움말·연락처";
  if (/신청|예약|apply|reserv/i.test(t) || /apply|reserv|write|form|regist/.test(path)) return "입력 폼";
  if (/view|detail|read|:n|:id/.test(urlPattern(url).toLowerCase()) || /[?&](no|idx|id|seq|nttid|bbsid)=/i.test(url)) return "상세";
  if (/list|board|notice|news|bbs/.test(path)) return "목록";
  return "기타";
}

export interface SampleResult {
  /** 점검할 페이지 (최대 수 안) */
  picked: Sampled[];
  /** 고르고 싶었지만 최대 수(한도) 때문에 이번에 넣지 못한 유형별 대표 페이지 */
  uncovered: Sampled[];
  /** 찾은 페이지의 서로 다른 틀(주소 모양) 수 */
  templates: number;
}

/** 주소 틀: 숫자·긴 id 는 자리표시로 바꾸고, 쿼리는 이름만 남긴다 */
export function urlPattern(raw: string): string {
  try {
    const u = new URL(raw);
    const segs = u.pathname
      .split("/")
      .map((s) => (/^\d+$/.test(s) ? ":n" : /^[0-9a-f-]{16,}$/i.test(s) ? ":id" : s.replace(/\d+(?=\.\w+$)/, ":n")));
    const keys = [...u.searchParams.keys()].sort();
    return `${u.host}${segs.join("/")}${keys.length ? `?${keys.join("&")}` : ""}`;
  } catch {
    return raw;
  }
}

const REQUIRED: { re: RegExp; reason: string }[] = [
  { re: /로그인|login|sign\s?in|ログイン/i, reason: "필수: 로그인" },
  { re: /검색|search|検索/i, reason: "필수: 검색" },
  { re: /문의|고객\s?센터|상담|contact|問い合わせ|お問合せ/i, reason: "필수: 문의" },
  { re: /접근성|accessibility|アクセシビリティ/i, reason: "필수: 접근성 안내" },
  { re: /사이트\s?맵|sitemap|サイトマップ/i, reason: "필수: 사이트맵" },
  { re: /회원\s?가입|join|sign\s?up|register|会員登録/i, reason: "필수: 회원가입" },
  { re: /신청|예약|apply|reserv|申請|予約/i, reason: "주요 업무: 신청·예약" },
];

export function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    // 추적용 쿼리 제거
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

export function sameSite(url: string, base: string): boolean {
  try {
    return new URL(url).host === new URL(base).host;
  } catch {
    return false;
  }
}

/** 점검 범위로 인정하는 정확한 origin 목록 (Codex 보안 리스크 1).
 *  시작 주소의 origin, 같은 호스트의 https, www 를 붙이거나 뗀 것만. 그 밖의 하위 도메인은 범위 밖이다.
 *  기관이 여러 도메인을 쓰면 A11Y_SCOPE_EXTRA_ORIGINS="https://m.a.go.kr,https://b.a.go.kr" 로 명시해 더한다 */
export function scopeOrigins(base: string, env: Record<string, string | undefined> = process.env): Set<string> {
  const out = new Set<string>();
  try {
    const u = new URL(base);
    const hosts = [u.host, u.host.startsWith("www.") ? u.host.slice(4) : `www.${u.host}`];
    const schemes = u.protocol === "http:" ? ["http:", "https:"] : [u.protocol];
    for (const h of hosts) for (const sc of schemes) out.add(`${sc}//${h}`);
  } catch {
    return out;
  }
  for (const o of (env.A11Y_SCOPE_EXTRA_ORIGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    try {
      out.add(new URL(o).origin);
    } catch {
      /* 잘못된 값은 무시 */
    }
  }
  return out;
}

export function inScope(url: string, base: string, env?: Record<string, string | undefined>): boolean {
  try {
    return scopeOrigins(base, env).has(new URL(url).origin);
  } catch {
    return false;
  }
}

/** WCAG-EM 3.e 무작위 표본의 선정 이유 (서류·묶음은 이 머리말로 무작위 표본을 센다) */
export const RANDOM_REASON = "무작위 표본 (구조적 표본의 10%)";
export const RANDOM_SHARE = 0.1;

/** 같은 입력이면 같은 순서가 나오는 섞기 값 (FNV-1a). 다시 점검해도 같은 무작위 표본을 고르므로 재현할 수 있다 */
function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * 구조적 표본(홈·필수·틀마다 대표)에 더해, 아직 뽑히지 않은 주소에서 구조적 표본 수의 10%(올림)를 무작위로 더한다 (WCAG-EM 3.e).
 * 무작위 표본은 같은 틀의 다른 페이지일 수 있다 — 대표 페이지가 틀 전체를 잘 나타내는지 확인하는 용도다.
 * 최대 수를 넘으면 가장 뒤의 틀 대표(홈·필수 아님)를 빼서 자리를 만든다. 고를 주소가 없으면 0개이고, 서류에 0으로 적는다.
 */
export function pickRepresentatives(entries: CrawlEntry[], baseUrl: string, max: number, opts: { randomShare?: number } = {}): Sampled[] {
  return pickSample(entries, baseUrl, max, opts).picked;
}

/**
 * 유형과 틀을 모두 덮는 구조적 표본을 먼저 다 고른 뒤(개수 제한 없이), 최대 수에 맞춰 자르고 잘린 것을 따로 돌려준다.
 * 잘린 대표 페이지는 보고서의 "유형별 커버리지"에 "한도로 이번에 점검하지 못함"으로 적는다 (조용히 빼지 않는다).
 */
export function pickSample(entries: CrawlEntry[], baseUrl: string, max: number, opts: { randomShare?: number } = {}): SampleResult {
  const full = pickStructured(entries, baseUrl, Number.MAX_SAFE_INTEGER);
  const templates = new Set(entries.map((e) => urlPattern(e.url))).size;
  const structured = full.slice(0, max);
  const cut = full.slice(max);
  const share = opts.randomShare ?? RANDOM_SHARE;
  const want = share > 0 && structured.length ? Math.ceil(structured.length * share) : 0;
  const taken = new Set(structured.map((p) => p.url));
  const pool = entries.filter((e) => !taken.has(e.url)).sort((a, b) => stableHash(`${baseUrl}|${a.url}`) - stableHash(`${baseUrl}|${b.url}`) || a.url.localeCompare(b.url));
  let n = Math.min(want, pool.length);
  if (!n) return { picked: structured, uncovered: cut, templates };
  const out = [...structured];
  const removed: Sampled[] = [];
  // 자리 만들기: 뒤에서부터 틀 대표만 뺀다
  while (out.length + n > max) {
    const i = out.map((p) => p.reason).findLastIndex((r) => r.startsWith("같은 틀") || r === "개별 페이지");
    if (i < 0) break;
    removed.unshift(...out.splice(i, 1));
  }
  n = Math.min(n, Math.max(0, max - out.length));
  for (const e of pool.slice(0, n)) {
    const key = urlPattern(e.url);
    out.push({ url: e.url, templateKey: key, reason: RANDOM_REASON, groupSize: entries.filter((x) => urlPattern(x.url) === key).length });
  }
  const inPick = new Set(out.map((p) => p.url));
  return { picked: out, uncovered: [...removed, ...cut].filter((u) => !inPick.has(u.url)), templates };
}

function pickStructured(entries: CrawlEntry[], baseUrl: string, max: number): Sampled[] {
  const groups = new Map<string, CrawlEntry[]>();
  for (const e of entries) {
    const key = urlPattern(e.url);
    const g = groups.get(key) ?? [];
    g.push(e);
    groups.set(key, g);
  }
  const picked: Sampled[] = [];
  const has = (url: string) => picked.some((p) => p.url === url);
  const add = (e: CrawlEntry, reason: string) => {
    if (has(e.url) || picked.length >= max) return;
    const key = urlPattern(e.url);
    picked.push({ url: e.url, templateKey: key, reason, groupSize: groups.get(key)?.length ?? 1 });
  };

  // 1) 홈
  const home = entries.find((e) => normalizeUrl(e.url, baseUrl) === normalizeUrl(baseUrl, baseUrl)) ?? entries[0];
  if (home) add(home, "홈");
  // 2) 꼭 봐야 하는 페이지
  for (const r of REQUIRED) {
    const hit = entries.filter((e) => e.texts.some((t) => r.re.test(t)) || r.re.test(new URL(e.url).pathname)).sort((a, b) => a.depth - b.depth)[0];
    if (hit) add(hit, r.reason);
  }
  // 3) 틀(묶음)마다 하나씩 — 얕은 페이지, 많이 쓰이는 틀부터
  const ordered = [...groups.entries()].sort((a, b) => {
    const da = Math.min(...a[1].map((e) => e.depth));
    const dbb = Math.min(...b[1].map((e) => e.depth));
    return da - dbb || b[1].length - a[1].length;
  });
  for (const [, g] of ordered) {
    const rep = [...g].sort((a, b) => a.depth - b.depth)[0];
    add(rep, g.length > 1 ? `같은 틀 페이지 ${g.length}개 중 대표` : "개별 페이지");
  }
  return picked;
}
