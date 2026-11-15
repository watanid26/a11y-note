// 접근성 점검노트 확장 — 백그라운드(서비스 워커).
// 하는 일: 현재 화면 검사, 흐름 녹화(화면이 바뀔 때마다 자동 검사·캡처), 서버 업로드 또는 파일 저장.
// 검사 엔진(a11y-core.js)은 서버 워커와 똑같은 파일이다 → 어디서 검사해도 결과가 같다.
// 비밀번호·입력값은 서버로 보내지 않는다: 캡처 전에 입력칸 글자를 흐리게 가리고, 녹화 단계에는 값 대신 자리표시만 남긴다.

const DANGER = /결제|구매하기|주문\s?(하기|완료)|예약\s?확정|신청\s?완료|접수\s?완료|탈퇴|삭제|송금|이체|pay|purchase|checkout|place order|delete|remove account|確定|購入|退会|削除/i;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

// ── 설정과 상태 ──────────────────────────────────────────────
async function settings() {
  const s = await chrome.storage.local.get(["server", "token", "offline", "keyboard", "locale", "review"]);
  // review: 올리기 전에 캡처를 사람이 확인 (기본 켬, P0-9 개인정보)
  return { server: (s.server || "").replace(/\/+$/, ""), token: s.token || "", offline: Boolean(s.offline), keyboard: s.keyboard !== false, locale: s.locale || "ko", review: s.review !== false };
}

const state = {
  scanId: null,
  recording: null, // { flowId, flowName, tabId, step, steps: [], stopBefore }
  busy: false,
  queue: Promise.resolve(),
  log: [],
};

function log(text, kind = "info") {
  state.log.unshift({ at: Date.now(), text, kind });
  state.log = state.log.slice(0, 80);
  chrome.runtime.sendMessage({ type: "log", entry: state.log[0], recording: publicRecording() }).catch(() => {});
}

function publicRecording() {
  return state.recording ? { flowId: state.recording.flowId, flowName: state.recording.flowName, step: state.recording.step, stopBefore: state.recording.stopBefore } : null;
}

// ── 서버 통신 ────────────────────────────────────────────────
async function api(path, init = {}) {
  const s = await settings();
  if (!s.server || !s.token) throw new Error("서버 주소와 연결 키를 먼저 넣어 주세요.");
  const res = await fetch(`${s.server}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${s.token}`, ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `서버 오류 ${res.status}`);
  return data;
}

// 인터넷이 안 될 때: 결과를 확장 저장소에 모아 두었다가 파일로 내려받는다
async function saveOffline(item) {
  const { offlineStates = [] } = await chrome.storage.local.get("offlineStates");
  offlineStates.push(item);
  await chrome.storage.local.set({ offlineStates });
  return offlineStates.length;
}

async function exportOffline() {
  const { offlineStates = [], offlineFlows = [] } = await chrome.storage.local.get(["offlineStates", "offlineFlows"]);
  const data = { format: "a11ynote-export-v1", exportedAt: new Date().toISOString(), states: offlineStates.map((x) => ({ ...x.state, screenshotOrigin: x.screenshotOrigin })), flows: offlineFlows };
  const url = `data:application/json;base64,${btoa(unescape(encodeURIComponent(JSON.stringify(data))))}`;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  // 파일 저장 권한은 처음 쓸 때 사이드 패널에서 요청한다 (선택 권한, P0-5)
  if (!(await chrome.permissions.contains({ permissions: ["downloads"] }))) throw new Error("파일 저장 권한이 없습니다. '결과 파일 저장'을 다시 눌러 권한을 허용해 주세요.");
  await chrome.downloads.download({ url, filename: `a11ynote-result-${stamp}.json`, saveAs: true });
  return offlineStates.length;
}

// ── 검사 ─────────────────────────────────────────────────────
async function inject(tabId) {
  const [{ result: has }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => Boolean(window.__a11yCore) });
  if (!has) await chrome.scripting.executeScript({ target: { tabId }, files: ["a11y-core.js"] });
}

async function evalIn(tabId, func, args = []) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result;
}

/** 크롬 디버거로 실제 Tab 키를 눌러 초점 이동을 기록한다 (크롬 상단에 "디버깅 중" 안내가 잠시 뜸) */
async function keyboardTrace(tabId, maxStops = 150) {
  // 디버거 권한은 사용자가 Tab 키 검사를 켤 때만 요청한다 (선택 권한, P0-5). 없으면 키보드 항목은 사람 확인으로 남는다
  if (!(await chrome.permissions.contains({ permissions: ["debugger"] }))) {
    log("Tab 키 검사 권한이 없어 키보드 검사를 건너뛰었습니다 (키보드 항목은 사람 확인 필요).", "warn");
    return null;
  }
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    const focusableCount = await evalIn(tabId, () => window.__a11yCore.prepareFocus());
    const limit = Math.min(maxStops, focusableCount + 5);
    const stops = [];
    let trappedAt = null;
    let same = 0;
    for (let i = 0; i < limit; i++) {
      for (const type of ["keyDown", "keyUp"]) {
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      }
      const info = await evalIn(tabId, (idx) => window.__a11yCore.focusInfo(idx), [i]);
      if (!info) {
        if (stops.length) break;
        continue;
      }
      const prev = stops[stops.length - 1];
      if (prev && prev.selector === info.selector) {
        if (++same >= 2) {
          trappedAt = info.selector;
          break;
        }
        continue;
      }
      same = 0;
      if (stops.length > 1 && info.selector === stops[0].selector) break;
      stops.push(info);
    }
    // 역방향(Shift+Tab)으로도 갇히는지 본다
    let reverseTrappedAt = null;
    if (!trappedAt && stops.length > 1) {
      let last = null;
      let rsame = 0;
      for (let i = 0; i < Math.min(maxStops, stops.length + 5); i++) {
        for (const type of ["keyDown", "keyUp"]) {
          await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: 8 });
        }
        const info = await evalIn(tabId, (idx) => window.__a11yCore.focusInfo(idx), [-1 - i]);
        if (!info) break;
        if (info.selector === last) {
          if (++rsame >= 2) {
            reverseTrappedAt = info.selector;
            break;
          }
          continue;
        }
        rsame = 0;
        last = info.selector;
        if (info.selector === stops[0].selector) break;
      }
    }
    const first = stops[0];
    return { stops, focusableCount, trappedAt, reverseTrappedAt, firstStopIsSkipLink: Boolean(first && /본문|건너뛰|바로\s?가기|skip|content|本文/i.test(first.text)) };
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

/** 보이는 영역 캡처. 입력칸 글자는 가린 상태로 찍는다 */
async function capture(tab) {
  await evalIn(tab.id, () => window.__a11yCore.maskInputs(true));
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 72 });
    const view = await evalIn(tab.id, () => ({ x: window.scrollX, y: window.scrollY, dpr: window.devicePixelRatio || 1 }));
    return { screenshot: dataUrl.split(",")[1], origin: { x: view.x, y: view.y }, scale: view.dpr };
  } finally {
    await evalIn(tab.id, () => window.__a11yCore.maskInputs(false)).catch(() => {});
  }
}

/** 한 화면 상태를 검사하고 올린다 (또는 저장) */
async function scanTab(tabId, opts = {}) {
  const s = await settings();
  const tab = await chrome.tabs.get(tabId);
  // 사이트 접근 권한은 사이트별로 사용자가 허용한다 (선택 권한, P0-5). 권한이 없으면 주소를 읽을 수 없다
  if (!tab.url) throw new Error("이 사이트에 접근 권한이 없습니다. 사이드 패널의 '현재 사이트 허용'을 눌러 주세요.");
  if (!/^https?:/.test(tab.url)) throw new Error("웹 페이지에서만 검사할 수 있습니다.");
  if (!(await chrome.permissions.contains({ origins: [`${new URL(tab.url).origin}/*`] }))) throw new Error(`${new URL(tab.url).origin} 접근 권한이 없습니다. 사이드 패널의 '현재 사이트 허용'을 눌러 주세요.`);
  await inject(tabId);
  const snapshot = await evalIn(tabId, (loc) => window.__a11yCore.run({ locale: loc }), [s.locale]);
  // 화면 캡처는 "모든 사이트 캡처" 권한(또는 아이콘 클릭으로 받은 activeTab)이 있어야 한다.
  // 없으면 캡처 없이 검사 결과만 올리고 안내한다 (사이트별 권한만으로는 크롬이 캡처를 허용하지 않음)
  const shot = await capture(tab).catch((e) => {
    log(`캡처 없이 결과만 처리합니다 (${/all_urls|activeTab/.test(e.message) ? "캡처 권한 없음 — 사이드 패널에서 '화면 캡처 허용'" : e.message})`, "warn");
    return { screenshot: null, origin: null, scale: 1 };
  });
  const keyboard = opts.keyboard ?? s.keyboard ? await keyboardTrace(tabId).catch((e) => (log(`키보드 검사 생략: ${e.message}`, "warn"), null)) : null;
  const captured = {
    url: tab.url,
    title: snapshot.title,
    label: opts.label || snapshot.title || tab.url,
    flowId: opts.flowId || null,
    flowStep: opts.flowStep ?? null,
    snapshot,
    keyboard,
    screenshot: shot.screenshot,
    screenshotScale: shot.scale,
  };
  // 올리기 전 확인: 캡처를 확인 대기 목록에 두고, 사람이 사이드 패널에서 보고 올리기/버리기를 고른다
  if (s.review && !opts.noReview) {
    const id = crypto.randomUUID();
    const { pending = [] } = await chrome.storage.session.get("pending");
    pending.push({ id, at: Date.now(), captured, origin: shot.origin });
    await chrome.storage.session.set({ pending });
    chrome.runtime.sendMessage({ type: "pending:changed" }).catch(() => {});
    return { pending: true, id, waiting: pending.length, issues: snapshot.results.length };
  }
  return deliver(captured, shot.origin);
}

/** 서버로 올리거나(온라인) 파일 보관함에 넣는다(오프라인) */
async function deliver(captured, origin) {
  const s = await settings();
  if (s.offline) {
    const n = await saveOffline({ state: captured, screenshotOrigin: origin });
    return { offline: true, saved: n, issues: captured.snapshot.results.length };
  }
  const res = await api("/api/ext/states", { method: "POST", body: JSON.stringify({ scanId: state.scanId, screenshotOrigin: origin, state: captured }) });
  state.scanId = res.scanId;
  if (res.warning) log(res.warning, "warn");
  return { offline: false, findings: res.findings, scanId: res.scanId };
}

/** 확인 대기 목록 (사이드 패널 표시용: 캡처 썸네일·이름·주소만) */
async function pendingList() {
  const { pending = [] } = await chrome.storage.session.get("pending");
  return pending.map((p) => ({ id: p.id, at: p.at, label: p.captured.label, url: p.captured.url.replace(/[?#].*$/, ""), shot: p.captured.screenshot || null, issues: p.captured.snapshot.results.length }));
}

async function pendingResolve(id, approve) {
  const { pending = [] } = await chrome.storage.session.get("pending");
  const picked = id === "all" ? pending : pending.filter((p) => p.id === id);
  const rest = id === "all" ? [] : pending.filter((p) => p.id !== id);
  await chrome.storage.session.set({ pending: rest });
  let done = 0;
  for (const p of picked) {
    if (approve) {
      const r = await deliver(p.captured, p.origin);
      log(r.offline ? `${p.captured.label}: 확인 후 저장함` : `${p.captured.label}: 확인 후 올렸습니다 (발견 ${r.findings}건)`, "ok");
    } else log(`${p.captured.label}: 버렸습니다 (서버로 보내지 않음)`);
    done++;
  }
  chrome.runtime.sendMessage({ type: "pending:changed" }).catch(() => {});
  return { done, left: rest.length };
}

function resultText(r, label) {
  if (r.pending) return `${label}: 확인 대기 (${r.waiting}건) — 사이드 패널에서 캡처를 보고 올리기를 눌러 주세요`;
  return r.offline ? `${label}: 저장함 (${r.saved}개 보관 중)` : `${label}: 검사해서 올렸습니다 (발견 ${r.findings}건)`;
}

function enqueue(job) {
  state.queue = state.queue.then(job).catch((e) => log(e.message, "error"));
  return state.queue;
}

// ── 흐름 녹화 ─────────────────────────────────────────────────
async function startRecording(tabId, flow) {
  state.recording = { flowId: flow.id, flowName: flow.name, tabId, step: 0, steps: [], stopBefore: flow.stopBefore || "" };
  await chrome.scripting.executeScript({ target: { tabId }, files: ["recorder.js"] });
  await chrome.tabs.sendMessage(tabId, { type: "recorder:start", stopBefore: flow.stopBefore || "" }).catch(() => {});
  log(`"${flow.name}" 녹화를 시작했습니다. 안내대로 진행하면 화면이 바뀔 때마다 자동으로 검사합니다.`);
  await recordStep("시작 화면");
}

async function recordStep(reason) {
  const rec = state.recording;
  if (!rec) return;
  return enqueue(async () => {
    rec.step += 1;
    const label = `${rec.flowName} ${rec.step}단계${reason ? ` — ${reason}` : ""}`;
    const r = await scanTab(rec.tabId, { flowId: rec.flowId, flowStep: rec.step, label });
    log(resultText(r, label));
  });
}

async function stopRecording(save) {
  const rec = state.recording;
  if (!rec) return;
  state.recording = null;
  await chrome.tabs.sendMessage(rec.tabId, { type: "recorder:stop" }).catch(() => {});
  await state.queue;
  if (!save) return log("녹화를 취소했습니다.");
  const s = await settings();
  if (s.offline) {
    const { offlineFlows = [] } = await chrome.storage.local.get("offlineFlows");
    offlineFlows.push({ id: rec.flowId, status: "recorded", steps: rec.steps });
    await chrome.storage.local.set({ offlineFlows });
  } else {
    await api(`/api/ext/flows/${rec.flowId}`, { method: "POST", body: JSON.stringify({ status: "recorded", steps: rec.steps }) });
  }
  log(`"${rec.flowName}" 녹화를 마쳤습니다 (${rec.step}개 화면).`, "ok");
}

// 페이지 이동이 끝나면 다음 단계로 검사
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  const rec = state.recording;
  if (!rec || tabId !== rec.tabId || info.status !== "complete") return;
  if (!tab.url) {
    log("허용하지 않은 사이트로 이동해 이 화면은 검사하지 않았습니다. 필요하면 '현재 사이트 허용'을 누른 뒤 '지금 화면도 검사'를 눌러 주세요.", "warn");
    return;
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ["recorder.js"] }).catch(() => {});
  await chrome.tabs.sendMessage(tabId, { type: "recorder:start", stopBefore: rec.stopBefore }).catch(() => {});
  recordStep("페이지 이동");
});


// ── 자동 검사 (웹에서 주소를 넣으면 이 크롬이 화면을 하나씩 열어 검사) ─────────────
// 서버가 "다음에 볼 화면"을 알려 주면 → 백그라운드 창에서 열고 → 검사·캡처 → 결과를 올린다 → 반복.
// 확장 키는 점검노트 사이트(bridge.js)에서 로그인한 상태로 자동으로 받는다. 사람이 키를 복사하지 않는다.
// 서비스 워커가 잠들어도 30초마다 깨어나 대기열(chrome.storage.local.autoQueue)을 이어서 처리한다.
const auto = { running: false, windowId: null, tabId: null, current: null, lastErrors: {} };
// 대기열에 이보다 오래 머문 검사는 서버가 이미 실패로 정리했으므로 버린다 (서버는 10분)
const AUTO_STALE_MS = 30 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function devices() {
  const { devices = {} } = await chrome.storage.local.get("devices");
  return devices;
}

async function devApi(server, path, init = {}) {
  const token = (await devices())[server];
  if (!token) throw Object.assign(new Error("확장 연결이 필요합니다."), { unpaired: true });
  let res;
  try {
    // 응답 없이 멈추면 대기열 전체가 서므로 시간 제한을 둔다 (서버 함수 한도 60초 + 여유)
    res = await fetch(`${server}${path}`, { ...init, signal: AbortSignal.timeout(75000), headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  } catch (e) {
    throw Object.assign(new Error(`${new URL(server).host} 에 연결하지 못했습니다.`), { network: true });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const d = await devices();
    delete d[server];
    await chrome.storage.local.set({ devices: d });
    throw Object.assign(new Error(data.error || "확장 연결이 끊겼습니다."), { unpaired: true });
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `서버 오류 ${res.status}`), { status: res.status });
  return data;
}

function waitComplete(tabId, ms) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      chrome.tabs.onUpdated.removeListener(on);
      resolve();
    };
    const on = (id, info) => id === tabId && info.status === "complete" && done();
    const t = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(on);
  });
}

async function openInWorkTab(url) {
  if (auto.tabId != null) {
    try {
      await chrome.tabs.update(auto.tabId, { url });
      return auto.tabId;
    } catch {
      auto.tabId = null;
    }
  }
  // 검사용 창: 사용자가 쓰는 창을 가리지 않게 포커스 없이 연다
  const w = await chrome.windows.create({ url, focused: false, width: 1280, height: 900, type: "normal" });
  auto.windowId = w.id;
  auto.tabId = w.tabs[0].id;
  return auto.tabId;
}

async function closeWorkWindow() {
  if (auto.windowId != null) await chrome.windows.remove(auto.windowId).catch(() => {});
  auto.windowId = null;
  auto.tabId = null;
}

/** 페이지 전체를 한 장으로 캡처 (디버거 사용). 입력칸 글자는 가리고, 너무 긴 페이지는 위쪽만 */
async function fullShot(tabId) {
  const dpr = await evalIn(tabId, () => {
    window.__a11yCore.maskInputs(true);
    window.scrollTo(0, 0);
    return window.devicePixelRatio || 1;
  });
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    const m = await chrome.debugger.sendCommand(target, "Page.getLayoutMetrics");
    const size = m.cssContentSize || m.contentSize;
    const width = Math.min(Math.ceil(size.width), 1600);
    const height = Math.min(Math.ceil(size.height), 7000);
    const r = await chrome.debugger.sendCommand(target, "Page.captureScreenshot", {
      format: "jpeg",
      quality: 65,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 / dpr },
    });
    return { screenshot: r.data, origin: { x: 0, y: 0 }, scale: 1 };
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
    await evalIn(tabId, () => window.__a11yCore.maskInputs(false)).catch(() => {});
  }
}

function withLimit(promise, ms, message) {
  return Promise.race([promise, sleep(ms).then(() => Promise.reject(new Error(message)))]);
}

/** 화면 하나: 열기 → 검사 → (첫 화면이면 링크 모으기) → 키보드 → 캡처 */
async function visitPage(next) {
  const tabId = await openInWorkTab(next.page.url);
  await waitComplete(tabId, 25000);
  await sleep(1500);
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:/.test(tab.url || "")) throw new Error("열 수 없는 주소");
  await inject(tabId);
  const snapshot = await evalIn(tabId, (loc) => window.__a11yCore.run({ locale: loc }), [next.locale]);
  const links = next.wantLinks
    ? await evalIn(tabId, () =>
        [...document.querySelectorAll("a[href]")].slice(0, 500).map((a) => ({ url: a.href, text: (a.innerText || a.getAttribute("aria-label") || a.title || "").replace(/\s+/g, " ").trim().slice(0, 60) })),
      )
    : undefined;
  const keyboard = await keyboardTrace(tabId, 60).catch(() => null);
  const shot = await fullShot(tabId).catch((e) => {
    log(`캡처 실패: ${e.message}`, "warn");
    return { screenshot: null, origin: null, scale: 1 };
  });
  return {
    links,
    screenshotOrigin: shot.origin,
    state: {
      url: tab.url,
      title: snapshot.title,
      label: snapshot.title || tab.url,
      flowId: null,
      flowStep: null,
      snapshot,
      keyboard,
      screenshot: shot.screenshot,
      screenshotScale: shot.scale,
    },
  };
}

/** 회차 하나를 끝까지. "retry" 면 서버에 못 닿은 것 → 대기열에 남겨 두고 잠시 뒤 다시 */
async function runJob(job) {
  for (let guard = 0; guard < 300; guard++) {
    let next;
    try {
      next = await devApi(job.server, `/api/ext/run/${job.scanId}`);
    } catch (e) {
      auto.lastErrors[job.server] = { scanId: job.scanId, message: e.message, at: Date.now() };
      if (e.unpaired || e.status === 404) return "drop";
      return "retry";
    }
    delete auto.lastErrors[job.server];
    if (next.done) return "done";
    auto.current = { scanId: job.scanId, index: next.index, total: next.total, url: next.page.url };
    let result;
    try {
      result = await withLimit(visitPage(next), 60000, "화면 검사 시간 초과");
    } catch (e) {
      result = { error: /시간 초과/.test(e.message) ? "화면 검사 시간 초과" : "화면을 열거나 검사하지 못함" };
    }
    try {
      await devApi(job.server, `/api/ext/run/${job.scanId}`, { method: "POST", body: JSON.stringify({ url: next.page.url, ...result }) });
    } catch (e) {
      if (e.unpaired || e.status === 404) return "drop";
      if (e.status === 413 || e.status === 400) {
        // 캡처가 너무 크면 캡처 없이 결과만 다시
        if (result.state) result.state.screenshot = null;
        await devApi(job.server, `/api/ext/run/${job.scanId}`, { method: "POST", body: JSON.stringify({ url: next.page.url, ...result }) }).catch(() => {});
      } else return "retry";
    }
  }
  return "done";
}

async function pumpAuto() {
  if (auto.running) return;
  auto.running = true;
  try {
    // 한 검사가 서버에 닿지 않아도(예: 꺼 둔 개발 서버) 뒤의 검사를 막지 않도록, 이번 차례에 대기열을 한 바퀴만 돈다.
    // 닿지 않은 검사는 대기열에 남겨 두고 30초 뒤 알람에서 다시 시도한다.
    const { autoQueue: snapshot = [] } = await chrome.storage.local.get("autoQueue");
    for (const job of snapshot) {
      const { autoQueue = [] } = await chrome.storage.local.get("autoQueue");
      if (!autoQueue.some((x) => x.scanId === job.scanId)) continue;
      let r;
      if (Date.now() - (job.at || 0) > AUTO_STALE_MS) r = "drop";
      else {
        log(`자동 검사 시작 (${new URL(job.server).host})`);
        r = await runJob(job);
      }
      if (r === "retry") {
        log(`${new URL(job.server).host} 에 연결하지 못해 잠시 뒤 다시 시도합니다.`, "warn");
        continue;
      }
      const { autoQueue: q = [] } = await chrome.storage.local.get("autoQueue");
      await chrome.storage.local.set({ autoQueue: q.filter((x) => x.scanId !== job.scanId) });
      log(r === "done" ? "자동 검사를 마쳤습니다." : "자동 검사를 이어 갈 수 없어 멈췄습니다.", r === "done" ? "ok" : "warn");
    }
  } finally {
    auto.running = false;
    auto.current = null;
    await closeWorkWindow();
  }
}

/** 웹 화면에 보여 줄 이 서버 기준 상태 (다른 서버의 오류·검사 번호는 넘기지 않는다) */
async function autoStatus(server) {
  const { autoQueue = [] } = await chrome.storage.local.get("autoQueue");
  const mine = autoQueue.filter((q) => q.server === server);
  const err = auto.lastErrors[server] ?? null;
  return { running: auto.current, queued: mine.map((q) => q.scanId), waitingBehind: autoQueue.length - mine.length, lastError: err };
}

async function enqueueAuto(server, scanId) {
  const { autoQueue = [] } = await chrome.storage.local.get("autoQueue");
  if (!autoQueue.some((q) => q.scanId === scanId)) autoQueue.push({ server, scanId, at: Date.now() });
  await chrome.storage.local.set({ autoQueue: autoQueue.slice(-20) });
  pumpAuto();
}

chrome.alarms.create("a11ynote-auto", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "a11ynote-auto") pumpAuto();
});

/** bridge.js 를 거쳐 점검노트 웹 화면에서 온 요청. 출처는 메시지 내용이 아니라 보낸 탭 주소로 정한다 */
async function onSiteMessage(msg, sender) {
  const server = sender.origin || (sender.url ? new URL(sender.url).origin : null);
  if (!server || !/^(https:\/\/a11ynote\.vercel\.app|http:\/\/localhost:3200)$/.test(server)) throw new Error("허용되지 않은 출처");
  switch (msg.type) {
    case "auto:hello":
      return { version: chrome.runtime.getManifest().version, paired: Boolean((await devices())[server]), ...(await autoStatus(server)) };
    case "auto:pair": {
      if (!/^ad_[0-9a-f]{48}$/.test(msg.token || "")) throw new Error("잘못된 연결 키");
      const d = await devices();
      d[server] = msg.token;
      await chrome.storage.local.set({ devices: d });
      return { paired: true };
    }
    case "auto:run": {
      if (!/^[0-9a-f-]{36}$/i.test(msg.scanId || "")) throw new Error("잘못된 검사 번호");
      if (!(await devices())[server]) return { needPair: true };
      await enqueueAuto(server, msg.scanId);
      return { started: true };
    }
    case "auto:status":
      return autoStatus(server);
    default:
      return null;
  }
}

// ── 메시지 (사이드 패널, 녹화 스크립트) ──────────────────────
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (typeof msg.type === "string" && msg.type.startsWith("auto:")) return onSiteMessage(msg, sender);
    switch (msg.type) {
      case "project": {
        const data = await api("/api/ext/project");
        state.scanId = data.scanId;
        await chrome.storage.local.set({ locale: data.project.pack === "jis2016" ? "ja" : "ko" });
        return data;
      }
      case "scanCurrent": {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return enqueue(async () => {
          const r = await scanTab(tab.id, { label: msg.label });
          log(resultText(r, "현재 화면"), r.pending ? "info" : "ok");
          return r;
        });
      }
      case "startRecording": {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (msg.flow.startUrl && !tab.url?.startsWith(new URL(msg.flow.startUrl).origin)) {
          await chrome.tabs.update(tab.id, { url: msg.flow.startUrl });
          await new Promise((r) => setTimeout(r, 1500));
        }
        await startRecording(tab.id, msg.flow);
        return publicRecording();
      }
      case "stopRecording":
        await stopRecording(msg.save !== false);
        return null;
      case "recordNow":
        if (state.recording) await recordStep("직접 요청");
        return null;
      case "status":
        return { recording: publicRecording(), log: state.log, settings: await settings() };
      case "export":
        return { count: await exportOffline() };
      case "pending:list":
        return pendingList();
      case "pending:approve":
        return pendingResolve(msg.id, true);
      case "pending:discard":
        return pendingResolve(msg.id, false);
      case "clearOffline":
        await chrome.storage.local.set({ offlineStates: [], offlineFlows: [] });
        return { ok: true };
      // 녹화 스크립트에서
      case "recorder:step":
        if (state.recording && sender.tab?.id === state.recording.tabId) state.recording.steps.push(msg.step);
        return null;
      case "recorder:changed":
        if (state.recording && sender.tab?.id === state.recording.tabId) recordStep(msg.reason);
        return null;
      case "recorder:blocked":
        log(`위험한 버튼 "${msg.text}" 을(를) 녹화 중이라 막았습니다.`, "warn");
        return null;
      default:
        return null;
    }
  })()
    .then((data) => reply({ ok: true, data }))
    .catch((e) => reply({ ok: false, error: e.message }));
  return true;
});

// 테스트용 노출
globalThis.__a11yExt = { auto, pumpAuto, enqueueAuto, scanTab, startRecording, stopRecording, recordStep, state, exportOffline, settings, pendingList, pendingResolve };
