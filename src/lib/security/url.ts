// 주소 비식별화 (저장·보고서·AI·로그 공통).
//
// 원칙
//  1) 기본은 origin + pathname 만 남긴다. 쿼리·조각(#)·계정 정보는 버린다.
//  2) 쿼리는 "명시적인 키·값 허용 목록"에 맞는 것만 남긴다 (예: menuId=1234). 그 밖의 키는 이름과 상관없이 모두 버린다.
//  3) 경로 조각 중 이메일·전화·주민번호·JWT·긴 토큰·Base64 처럼 보이는 것은 "[redacted]" 로 바꾼다.
//     (이 모양 탐지는 보조 수단이다. 기본 차단은 1·2가 한다)
//  4) HTML·문맥·로그 같은 글 속의 주소(절대·상대, href/src/action 등 속성값)도 같은 규칙으로 바꾼다.

const REDACTED = "[redacted]";

/** 화면을 구분하는 데 쓰는 쿼리만, 짧은 영숫자 값일 때만 남긴다. 키는 대소문자 무시 */
const DEFAULT_QUERY_ALLOW: Record<string, RegExp> = {
  menuid: /^[A-Za-z0-9_-]{1,20}$/,
  menuno: /^\d{1,10}$/,
  menucd: /^[A-Za-z0-9_-]{1,20}$/,
  mid: /^[A-Za-z0-9_-]{1,20}$/,
  bbsid: /^[A-Za-z0-9_-]{1,20}$/,
  bbsno: /^\d{1,10}$/,
  boardid: /^[A-Za-z0-9_-]{1,20}$/,
  page: /^\d{1,5}$/,
  pageindex: /^\d{1,5}$/,
  pageno: /^\d{1,5}$/,
  cpage: /^\d{1,5}$/,
  lang: /^[A-Za-z]{2}(-[A-Za-z]{2})?$/,
};

/** 운영 설정으로 허용 키를 더한다: A11Y_URL_QUERY_ALLOW="key=정규식;key2=정규식" (값 정규식은 전체 일치) */
function queryAllow(env: Record<string, string | undefined> = process.env): Record<string, RegExp> {
  const extra = (env.A11Y_URL_QUERY_ALLOW ?? "").split(";").map((s) => s.trim()).filter(Boolean);
  if (!extra.length) return DEFAULT_QUERY_ALLOW;
  const out = { ...DEFAULT_QUERY_ALLOW };
  for (const pair of extra) {
    const i = pair.indexOf("=");
    if (i <= 0) continue;
    try {
      out[pair.slice(0, i).toLowerCase()] = new RegExp(`^(?:${pair.slice(i + 1)})$`);
    } catch {
      /* 잘못된 정규식은 무시 (허용하지 않음) */
    }
  }
  return out;
}

function decodeLoose(s: string): string {
  let out = s;
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(out.replace(/\+/g, " "));
      if (d === out) break;
      out = d;
    } catch {
      break;
    }
  }
  return out.normalize("NFKC");
}

/** 값 모양만 보고 개인정보·비밀값으로 보이는지 (보조 탐지) */
export function looksSensitive(raw: string): boolean {
  const v = decodeLoose(raw).trim();
  if (!v) return false;
  if (/[^\s@/]+@[^\s@/]+\.[^\s@/]+/.test(v)) return true; // 이메일
  if (/(^|\D)(\+?82[-\s]?|0)1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}(\D|$)/.test(v)) return true; // 휴대폰
  if (/(^|\D)0\d{1,2}[-\s.]\d{3,4}[-\s.]\d{4}(\D|$)/.test(v)) return true; // 일반 전화
  if (/(^|\D)\d{6}-?[1-8]\d{6}(\D|$)/.test(v)) return true; // 주민·외국인등록번호 형태
  if (/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/.test(v)) return true; // JWT
  if (/[A-Za-z0-9+/_-]{24,}={0,2}/.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v)) return true; // 긴 토큰·Base64
  if (/^[0-9a-f]{32,}$/i.test(v)) return true; // 해시·세션 ID
  return false;
}

function redactPath(pathname: string): string {
  return pathname
    .replace(/;[^/]*/g, "") // ;jsessionid=… 같은 경로 매개변수
    .split("/")
    .map((seg) => (seg && looksSensitive(seg) ? REDACTED : seg))
    .join("/");
}

function allowedQuery(u: URL, env?: Record<string, string | undefined>): string {
  const allow = queryAllow(env);
  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    const rule = allow[k.toLowerCase()];
    if (rule && rule.test(v) && !looksSensitive(v)) keep.append(k, v);
  }
  const q = keep.toString();
  return q ? `?${q}` : "";
}

/** 저장·보고서용 주소: origin + 경로(민감 조각 가림) + 허용 목록에 맞는 쿼리만 */
export function redactUrl(raw: string, env?: Record<string, string | undefined>): string {
  if (!raw) return raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return redactRelative(raw, env);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return `${u.protocol}(생략)`;
  return `${u.origin}${redactPath(u.pathname)}${allowedQuery(u, env)}`;
}

/** 외부 AI 로 보낼 때: origin + 경로만 (쿼리는 허용 목록이라도 보내지 않음) */
export function aiSafeUrl(raw: string): string {
  if (!raw) return raw;
  if (raw.startsWith("data:")) return "data:(생략)";
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return `${u.protocol}(생략)`;
    return `${u.origin}${redactPath(u.pathname)}`;
  } catch {
    return redactPath(raw.replace(/[?#].*$/, ""));
  }
}

/** 상대 주소(/board/view.do?token=…) */
function redactRelative(raw: string, env?: Record<string, string | undefined>): string {
  // 같은 페이지 안 이동(#main)은 짧은 이름일 때만 남긴다 (조각에 토큰을 싣는 경우가 있어서)
  if (raw.startsWith("#")) return /^#[A-Za-z][\w-]{0,40}$/.test(raw) ? raw : "#";
  if (/^(data|blob|javascript|mailto|tel):/i.test(raw)) return /^(mailto|tel):/i.test(raw) ? `${raw.split(":")[0]}:${REDACTED}` : raw.split(":")[0] + ":(생략)";
  try {
    const u = new URL(raw, "http://x.invalid");
    const path = redactPath(u.pathname);
    const rel = raw.startsWith("/") ? path : path.replace(/^\//, "");
    return `${rel}${allowedQuery(u, env)}`;
  } catch {
    return raw.replace(/[?#].*$/, "");
  }
}

const ABS_URL = /\b(?:https?:)?\/\/[^\s"'<>()`\\]+/gi;
const URL_ATTR = /\b(href|src|action|formaction|poster|cite|data-[\w-]+|srcset|background)\s*=\s*(["'])([\s\S]*?)\2/gi;

/** 글(HTML·문맥·로그·메시지) 속 주소를 모두 비식별화. 주소 밖의 이메일·JWT·긴 토큰도 가린다 */
export function redactText(text: string, env?: Record<string, string | undefined>): string {
  if (!text) return text;
  let s = text.replace(URL_ATTR, (_m, attr: string, q: string, val: string) => {
    if (attr.toLowerCase() === "srcset") return `${attr}=${q}${val.split(",").map((part) => part.trim().replace(/^\S+/, (u) => redactUrl(u, env))).join(", ")}${q}`;
    if (/^\s*(https?:)?\/\//i.test(val) || /[?#;]/.test(val) || /^(mailto|tel):/i.test(val)) return `${attr}=${q}${redactUrl(val.startsWith("//") ? `https:${val}` : val, env)}${q}`;
    return `${attr}=${q}${redactPath(val)}${q}`;
  });
  s = s.replace(ABS_URL, (m) => {
    const trail = /[.,;:!?]+$/.exec(m)?.[0] ?? "";
    const core = trail ? m.slice(0, -trail.length) : m;
    return redactUrl(core.startsWith("//") ? `https:${core}` : core, env) + trail;
  });
  s = s.replace(/;jsessionid=[^\s?#"'<>/]*/gi, "");
  // 주소 밖에 그대로 적힌 이메일·JWT
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED);
  s = s.replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(\.[A-Za-z0-9_-]+)?/g, REDACTED);
  s = s.replace(/(\+?82[-\s]?|\b0)1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g, REDACTED); // 휴대폰
  s = s.replace(/\b\d{6}-[1-8]\d{6}\b/g, REDACTED); // 주민·외국인등록번호 형태
  return s;
}
