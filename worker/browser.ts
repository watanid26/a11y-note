// 서버 워커의 브라우저 조작: 검사 코어 주입, Tab 순회, 입력칸 가림 캡처, 위험 요청 차단.

import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { CapturedState, FocusStop, KeyboardTrace, NavigationTrace, PageSnapshot } from "../src/core/types";
import { classifyPage } from "../src/lib/page-classification";
import { resolveAllowed, startEgressProxy, type EgressProxy } from "./egress-proxy";
import { checkUrl } from "../src/lib/security/egress";
import { inScope } from "../src/lib/sampling";

const CORE_JS = path.join(process.cwd(), "public", "a11y-core.js");
// Vercel 함수에서도 이 파일을 읽을 수 있게 next.config.mjs 의 outputFileTracingIncludes 에 넣어 둔다
let coreSource: string | null = null;
function core(): string {
  if (!coreSource) coreSource = readFileSync(CORE_JS, "utf8");
  return coreSource;
}

/** 브라우저마다 관문 프록시를 따로 띄운다. 회차별 받은 양 한도가 섞이지 않게 (Codex 리뷰 4) */
const proxies = new WeakMap<Browser, EgressProxy>();
/** 이 브라우저(회차)가 받은 바이트 */
export function proxyBytes(browser: Browser): number {
  return proxies.get(browser)?.bytes() ?? 0;
}

/**
 * 검사용 브라우저 열기.
 *  - 기본: 이 컴퓨터의 Chromium 을 관문 프록시와 함께 띄운다 (모든 요청이 프록시의 DNS·IP 검사를 거침)
 *  - 원격(BROWSER_WS_ENDPOINT, Browserless 등): 브라우저가 그쪽 망에서 돌아 로컬 프록시를 거치지 않는다.
 *    그래서 운영에서는 BROWSER_REMOTE_ENABLED=1 로 명시해야만 쓰고, 연결할 때마다 격리 검사(내부망·메타데이터에
 *    실제로 닿는지)를 해서 하나라도 닿으면 쓰지 않는다 (fail-closed). README "원격 브라우저 운영 조건" 참고.
 */
export async function openBrowser(env: Record<string, string | undefined> = process.env): Promise<{ browser: Browser; remote: boolean }> {
  const ws = env.BROWSER_WS_ENDPOINT;
  if (ws) {
    if (env.NODE_ENV === "production" && env.BROWSER_REMOTE_ENABLED !== "1") {
      throw new Error("원격 브라우저는 운영에서 기본으로 꺼져 있습니다 (BROWSER_REMOTE_ENABLED=1 과 격리 검사 통과가 필요).");
    }
    const browser = await chromium.connectOverCDP(ws, { timeout: 20_000 });
    try {
      await verifyRemoteIsolation(browser, ws, env);
    } catch (e) {
      await browser.close().catch(() => {});
      throw e;
    }
    return { browser, remote: true };
  }
  if (env.NODE_ENV === "production" && !env.CHROMIUM_PATH) throw new Error("검사 브라우저가 설정되지 않았습니다 (CHROMIUM_PATH).");
  return { browser: await launch(), remote: false };
}

/** 원격 브라우저가 닿으면 안 되는 곳. 응답이 하나라도 오면 격리 실패 */
export const ISOLATION_PROBES = [
  "http://169.254.169.254/latest/meta-data/", // AWS·여러 클라우드 메타데이터
  "http://metadata.google.internal/computeMetadata/v1/",
  "http://100.100.100.200/latest/meta-data/", // 알리바바
  "http://[fd00:ec2::254]/latest/meta-data/", // AWS IPv6 메타데이터
  "http://127.0.0.1/",
  "http://[::1]/",
  "http://10.0.0.1/",
  "http://172.16.0.1/",
  "http://192.168.0.1/",
];

const isolationOk = new Map<string, number>();
export class IsolationFailed extends Error {}

/** 원격 브라우저에서 내부 주소로 실제 이동해 본다. 연결 실패·시간 초과만 통과, HTTP 응답이 오면 실패 */
export async function verifyRemoteIsolation(browser: Browser, key: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  const until = isolationOk.get(key);
  if (until && until > Date.now()) return;
  // 배포 환경의 실제 내부 주소(DB·앱 사설 주소 등)를 더 넣는다: REMOTE_ISOLATION_PROBES="http://10.1.2.3:5432/,http://app.internal/"
  const probes = [...ISOLATION_PROBES, ...(env.REMOTE_ISOLATION_PROBES ?? "").split(",").map((x) => x.trim()).filter(Boolean)];
  const ctx = await browser.newContext();
  try {
    const reached: string[] = [];
    await Promise.all(
      probes.map(async (url) => {
        const page = await ctx.newPage();
        try {
          const resp = await page.goto(url, { timeout: Number(env.REMOTE_ISOLATION_TIMEOUT_MS ?? 3000), waitUntil: "commit" });
          if (resp) reached.push(url);
        } catch {
          /* 연결 실패·시간 초과 = 닿지 않음 (정상) */
        } finally {
          await page.close().catch(() => {});
        }
      }),
    );
    if (reached.length) throw new IsolationFailed(`원격 브라우저가 내부 주소에 닿습니다: ${reached.join(", ")} — 사용하지 않습니다.`);
    isolationOk.set(key, Date.now() + 10 * 60_000);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function launch(): Promise<Browser> {
  const proxy = await startEgressProxy();
  const port = proxy.port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
    args: [
      "--disable-dev-shm-usage",
      // SSRF 방어: 모든 요청을 관문 프록시로. Chromium 은 기본적으로 localhost 를 프록시 없이 직접 접속하므로 <-loopback> 으로 그 예외를 없앤다
      `--proxy-server=http://127.0.0.1:${port}`,
      "--proxy-bypass-list=<-loopback>",
      // WebRTC 가 프록시를 거치지 않고 내부망으로 UDP 를 보내지 못하게
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--webrtc-ip-handling-policy=disable_non_proxied_udp",
      // 프록시를 거치지 않는 QUIC(HTTP/3) 끔
      "--disable-quic",
      // 브라우저 부가 통신(업데이트·동기화·보고) 끔 — 검사와 무관한 외부 접속 최소화
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-sync",
      "--no-pings",
    ],
  });
  proxies.set(browser, proxy);
  browser.on("disconnected", () => void proxy.close());
  return browser;
}

/** 되돌릴 수 없는 동작을 막는 안전장치: GET 이 아닌 요청과 탈퇴·삭제·결제 주소를 모두 차단한다 */
export const DANGER_URL =
  /logout|log-out|signout|delete|remove|withdraw|탈퇴|삭제|결제|payment|checkout\/complete|order\/complete|(^|[\/_.?&=-])(un)?subscribe|favou?rite[_-]?(add|toggle|save)|bookmark[_-]?(add|save|toggle)|add[_-]?(bookmark|favou?rite|cart|wish)|(^|[\/_.?&=-])(vote|like|recommend|approve|confirm|cancel)(\.do|\.php|\.jsp|\.asp|[\/?&=]|$)|구독|좋아요|추천하기|찜하기|신청완료|취소하기/i;

/** 검사 범위를 벗어난 화면 (다른 사이트로 넘어감) */
export class OffScope extends Error {
  constructor(public finalUrl: string) {
    super("OFF_SCOPE");
  }
}

/**
 * 검사용 탭 묶음.
 *  - blockWrites: GET·HEAD 가 아닌 요청과 탈퇴·삭제·결제 주소 차단
 *  - scope: 주 문서(화면 자체)가 이 사이트 밖으로 넘어가는 이동은 막는다 (외부 로그인·제3자 사이트가 검사 결과에 섞이지 않게)
 *  - 모든 요청 주소를 1차 검사(checkUrl)한다. 원격 브라우저는 로컬 관문 프록시를 거치지 않으므로 이것이 우리 쪽 마지막 확인이다
 */
export async function newContext(
  browser: Browser,
  opts: { blockWrites: boolean; scope?: string; remote?: boolean; onBlock?: (url: string, code: string) => void },
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 a11ynote-checker",
  });
  const block = (url: string, code: string) => {
    opts.onBlock?.(url, code);
    return "blockedbyclient" as const;
  };
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (opts.blockWrites) {
      if (req.method() !== "GET" && req.method() !== "HEAD") return route.abort(block(url, "E_WRITE"));
      if (DANGER_URL.test(url)) return route.abort(block(url, "E_DANGER_URL"));
    }
    if (!/^(data|blob):/.test(url)) {
      let u: URL;
      try {
        u = checkUrl(url);
      } catch (e) {
        return route.abort(block(url, (e as { code?: string }).code ?? "E_BAD_URL"));
      }
      // 원격 브라우저는 로컬 프록시를 거치지 않으므로, 요청마다 우리 쪽에서 DNS 를 조회해 내부 주소면 막는다.
      // (원격 쪽 DNS 가 다른 답을 낼 수 있는 재바인딩은 격리 검사와 배포 망 정책으로 막는다)
      if (opts.remote) {
        try {
          await resolveAllowed(u.hostname, u.port || (u.protocol === "https:" ? "443" : "80"));
        } catch (e) {
          return route.abort(block(url, (e as { code?: string }).code ?? "E_DNS"));
        }
      }
    }
    if (opts.scope && req.isNavigationRequest() && req.frame().parentFrame() === null && !inScope(url, opts.scope)) return route.abort(block(url, "E_OFF_SCOPE"));
    return route.continue();
  });
  return ctx;
}

/** 이동이 끝난 뒤 최종 주소가 검사 범위·허용 주소인지 확인 (리다이렉트로 넘어간 경우 포함) */
export function assertInScope(page: Page, scope: string): void {
  const finalUrl = page.url();
  let ok = inScope(finalUrl, scope);
  try {
    checkUrl(finalUrl);
  } catch {
    ok = false;
  }
  if (!ok) throw new OffScope(finalUrl);
}

/** 최종 응답의 redirectFrom 체인을 보존해 요청 주소와 실제 도착 주소를 추적한다. */
export async function navigationTrace(response: import("playwright-core").Response | null, requestedUrl: string, finalUrl: string): Promise<NavigationTrace> {
  const chain: { url: string; status: number | null }[] = [];
  let request = response?.request() ?? null;
  while (request) {
    const responseForRequest = await request.response().catch(() => null);
    chain.push({ url: request.url(), status: responseForRequest?.status() ?? null });
    request = request.redirectedFrom();
  }
  chain.reverse();
  return {
    requestedUrl,
    finalUrl,
    status: response?.status() ?? chain.at(-1)?.status ?? null,
    redirected: requestedUrl !== finalUrl,
    redirectChain: chain,
  };
}

async function ensureCore(page: Page): Promise<void> {
  const has = await page.evaluate(() => Boolean((window as unknown as { __a11yCore?: unknown }).__a11yCore)).catch(() => false);
  if (!has) await page.addScriptTag({ content: core() });
}

export async function snapshot(page: Page, locale: "ko" | "ja" = "ko"): Promise<PageSnapshot> {
  await ensureCore(page);
  return page.evaluate((loc) => (window as unknown as { __a11yCore: { run: (o: object) => Promise<PageSnapshot> } }).__a11yCore.run({ locale: loc }), locale);
}

/** Tab 키를 실제로 눌러 초점 이동을 기록한다. 함정(빠져나가지 못함)과 초점 표시 유무를 본다. */
export async function keyboardTrace(page: Page, maxStops = 150): Promise<KeyboardTrace> {
  await ensureCore(page);
  const focusableCount = await page.evaluate(() => (window as unknown as { __a11yCore: { prepareFocus: () => number } }).__a11yCore.prepareFocus());
  const limit = Math.min(maxStops, focusableCount + 5);
  const stops: FocusStop[] = [];
  let trappedAt: string | null = null;
  let sameCount = 0;
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate((idx) => (window as unknown as { __a11yCore: { focusInfo: (n: number) => FocusStop | null } }).__a11yCore.focusInfo(idx), i);
    if (!info) {
      if (stops.length) break; // 문서 끝을 지나 주소창으로 나갔다
      continue;
    }
    const prev = stops[stops.length - 1];
    if (prev && prev.selector === info.selector) {
      sameCount++;
      if (sameCount >= 2) {
        trappedAt = info.selector;
        break;
      }
      continue;
    }
    sameCount = 0;
    if (stops.length > 1 && info.selector === stops[0].selector) break; // 한 바퀴 돌았다
    stops.push(info);
  }
  // 역방향(Shift+Tab): 마지막 초점에서 거꾸로 이동하며 같은 요소에 갇히는지 본다 (Codex 리뷰 7)
  let reverseTrappedAt: string | null = null;
  if (!trappedAt && stops.length > 1) {
    let last: string | null = null;
    let same = 0;
    for (let i = 0; i < Math.min(maxStops, stops.length + 5); i++) {
      await page.keyboard.press("Shift+Tab");
      const info = await page.evaluate((idx) => (window as unknown as { __a11yCore: { focusInfo: (n: number) => FocusStop | null } }).__a11yCore.focusInfo(idx), -1 - i);
      if (!info) break; // 문서 맨 앞을 지나 주소창으로 나갔다
      if (info.selector === last) {
        if (++same >= 2) {
          reverseTrappedAt = info.selector;
          break;
        }
        continue;
      }
      same = 0;
      last = info.selector;
      if (info.selector === stops[0].selector) break; // 맨 앞까지 거꾸로 왔다
    }
  }
  const first = stops[0];
  return {
    stops,
    focusableCount,
    trappedAt,
    reverseTrappedAt,
    firstStopIsSkipLink: Boolean(first && /본문|건너뛰|바로\s?가기|skip|content|本文/i.test(first.text)),
  };
}

/** 입력칸 글자를 흐리게 가린 전체 화면 캡처 (너무 긴 페이지는 위에서부터 잘라 저장) */
export async function screenshot(page: Page, maxHeight = 7000): Promise<string> {
  await page.evaluate(() => (window as unknown as { __a11yCore: { maskInputs: (on: boolean) => void } }).__a11yCore.maskInputs(true)).catch(() => {});
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const buf = await page.screenshot({
    fullPage: h <= maxHeight,
    clip: h > maxHeight ? { x: 0, y: 0, width: page.viewportSize()?.width ?? 1280, height: maxHeight } : undefined,
    type: "png",
    animations: "disabled",
  });
  await page.evaluate(() => (window as unknown as { __a11yCore: { maskInputs: (on: boolean) => void } }).__a11yCore.maskInputs(false)).catch(() => {});
  return buf.toString("base64");
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
}

/** 한 화면 상태를 통째로 수집 */
export async function captureState(
  page: Page,
  label: string,
  opts: { keyboard: boolean; keyboardStops?: number; flowId?: string | null; flowStep?: number | null; locale?: "ko" | "ja"; navigation?: NavigationTrace },
): Promise<CapturedState> {
  const snap = await snapshot(page, opts.locale ?? "ko");
  const bodyText = await page.evaluate(() => (document.body?.innerText ?? "").slice(0, 12000)).catch(() => "");
  const classification = classifyPage({ url: page.url(), title: snap.title, text: bodyText });
  // 키보드 검사는 화면 상태를 바꿀 수 있으므로 캡처를 먼저 한다
  const shot = await screenshot(page);
  const kb = opts.keyboard ? await keyboardTrace(page, opts.keyboardStops).catch(() => null) : null;
  return {
    url: page.url(),
    title: snap.title,
    label,
    flowId: opts.flowId ?? null,
    flowStep: opts.flowStep ?? null,
    snapshot: snap,
    keyboard: kb,
    screenshot: shot,
    screenshotScale: 1,
    navigation: opts.navigation,
    screenKind: classification.kind,
    screenReason: classification.reason,
  };
}
