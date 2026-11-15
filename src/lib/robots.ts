// robots.txt 존중: 주소 수집(링크 따라가기·sitemap)에서 막힌 경로는 모으지 않는다.
// 사용자가 직접 넣은 시작 주소는 사용자의 요청이므로 그대로 점검한다.

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  /** 요청 간격 (초). 없으면 null */
  crawlDelay: number | null;
}

const AGENT = "a11ynote";

/** 우리 에이전트("a11ynote") 그룹이 있으면 그것, 없으면 "*" 그룹 규칙 */
export function parseRobots(text: string): RobotsRules {
  const groups: { agents: string[]; rules: RobotsRules }[] = [];
  let cur: { agents: string[]; rules: RobotsRules } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: { allow: [], disallow: [], crawlDelay: null } };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "disallow" && val) cur.rules.disallow.push(val);
    else if (key === "allow" && val) cur.rules.allow.push(val);
    else if (key === "crawl-delay" && Number.isFinite(Number(val))) cur.rules.crawlDelay = Number(val);
  }
  // RFC 9309: 제품 이름과 대소문자 무시 정확히 일치할 때만 우리 그룹 (부분 일치 "a"·"note" 는 아님)
  const mine = groups.find((g) => g.agents.some((a) => a.split("/")[0].trim() === AGENT));
  const any = groups.find((g) => g.agents.includes("*"));
  return (mine ?? any)?.rules ?? { allow: [], disallow: [], crawlDelay: null };
}

function toRegex(rule: string): RegExp {
  const end = rule.endsWith("$");
  const body = (end ? rule.slice(0, -1) : rule).replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${body}${end ? "$" : ""}`);
}

/** 가장 긴 규칙이 이긴다 (같으면 Allow) */
export function robotsAllows(rules: RobotsRules, url: string): boolean {
  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    return true;
  }
  let best = { len: -1, allow: true };
  for (const r of rules.disallow) if (toRegex(r).test(path) && r.length > best.len) best = { len: r.length, allow: false };
  for (const r of rules.allow) if (toRegex(r).test(path) && r.length >= best.len) best = { len: r.length, allow: true };
  return best.allow;
}
