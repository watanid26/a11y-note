// 사이드 패널: 설정, 할 일(흐름) 목록과 안내, 녹화 조작, 진행 기록
const $ = (id) => document.getElementById(id);
let flows = [];
let project = null;
let server = "";

const DEFAULT_SERVER = "http://localhost:3200";

function send(type, extra = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...extra }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res?.ok) return reject(new Error(res?.error || "실패했습니다."));
      resolve(res.data);
    });
  });
}

const STATUS = { suggested: "직접 진행 필요", auto_done: "자동 완료", recorded: "녹화 완료", skipped: "건너뜀" };

function renderFlows() {
  const ul = $("flows");
  ul.textContent = "";
  $("flowBox").hidden = flows.length === 0;
  $("flowEmpty").hidden = flows.length > 0;
  for (const f of flows) {
    const li = document.createElement("li");
    const head = document.createElement("div");
    head.className = "row between";
    const name = document.createElement("b");
    name.textContent = f.name;
    const chip = document.createElement("span");
    chip.className = `chip ${f.status}`;
    chip.textContent = STATUS[f.status] || f.status;
    head.append(name, chip);
    const guide = document.createElement("p");
    guide.className = "guide";
    guide.textContent = f.guide;
    li.append(head, guide);
    if (f.stopBefore) {
      const stop = document.createElement("p");
      stop.className = "stop";
      stop.textContent = `누르지 마세요: ${f.stopBefore}`;
      li.append(stop);
    }
    if (f.status !== "skipped") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = f.status === "suggested" ? "" : "secondary";
      btn.textContent = f.status === "suggested" ? "녹화 시작" : "다시 녹화";
      btn.setAttribute("aria-label", `${f.name} ${btn.textContent}`);
      btn.addEventListener("click", () => startRec(f));
      li.append(btn);
    }
    ul.append(li);
  }
}

function addLog(entry) {
  const li = document.createElement("li");
  li.className = entry.kind;
  li.textContent = `${new Date(entry.at).toLocaleTimeString("ko-KR")} ${entry.text}`;
  $("log").prepend(li);
  while ($("log").children.length > 60) $("log").lastChild.remove();
}

function showRecording(rec) {
  $("recordingBox").hidden = !rec;
  if (!rec) return;
  $("recName").textContent = rec.flowName;
  $("recStep").textContent = String(rec.step);
  const f = flows.find((x) => x.id === rec.flowId);
  $("recGuide").textContent = f?.guide || "";
  $("recStop").textContent = rec.stopBefore ? `누르지 마세요: ${rec.stopBefore} (눌러도 녹화 중에는 막힙니다)` : "";
}

async function refreshOffline() {
  const { offline } = await chrome.storage.local.get("offline");
  const { offlineStates = [] } = await chrome.storage.local.get("offlineStates");
  $("offlineBox").hidden = !offline && offlineStates.length === 0;
  $("offlineCount").textContent = String(offlineStates.length);
}

async function refreshOrigins() {
  const all = await chrome.permissions.getAll();
  const ul = $("origins");
  ul.textContent = "";
  for (const o of all.origins || []) {
    const li = document.createElement("li");
    li.className = "row between";
    const span = document.createElement("span");
    span.textContent = o.replace(/\/\*$/, "");
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "ghost";
    rm.textContent = "허용 취소";
    rm.setAttribute("aria-label", `${span.textContent} 허용 취소`);
    rm.addEventListener("click", async () => {
      await chrome.permissions.remove({ origins: [o] });
      refreshOrigins();
    });
    li.append(span, rm);
    ul.append(li);
  }
}

async function refreshPending() {
  const items = await send("pending:list").catch(() => []);
  $("pendingBox").hidden = items.length === 0;
  $("pendingCount").textContent = String(items.length);
  const ul = $("pendingList");
  ul.textContent = "";
  for (const it of items) {
    const li = document.createElement("li");
    const title = document.createElement("b");
    title.textContent = it.label;
    const url = document.createElement("p");
    url.className = "muted small";
    url.textContent = `${it.url} · 발견 후보 ${it.issues}건`;
    li.append(title, url);
    if (it.shot) {
      const img = document.createElement("img");
      img.src = `data:image/jpeg;base64,${it.shot}`;
      img.alt = `${it.label} 캡처 미리보기`;
      li.append(img);
    }
    const row = document.createElement("div");
    row.className = "row";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = "올리기";
    ok.setAttribute("aria-label", `${it.label} 올리기`);
    ok.addEventListener("click", () => send("pending:approve", { id: it.id }).then(refreshPending));
    const no = document.createElement("button");
    no.type = "button";
    no.className = "secondary";
    no.textContent = "버리기";
    no.setAttribute("aria-label", `${it.label} 버리기`);
    no.addEventListener("click", () => send("pending:discard", { id: it.id }).then(refreshPending));
    row.append(ok, no);
    li.append(row);
    ul.append(li);
  }
}

async function connect() {
  try {
    const data = await send("project");
    project = data.project;
    flows = data.flows;
    $("projectLine").textContent = `${project.name} · ${project.packName}`;
    $("scanBtn").disabled = false;
    if (data.scanId) {
      $("resultLink").hidden = false;
      $("resultLink").href = `${server}/app/s/${data.scanId}`;
    }
    $("settingsBox").open = false;
    renderFlows();
  } catch (e) {
    $("projectLine").textContent = "웹 앱에서 검사 작업을 시작하면 자동으로 연결됩니다.";
    $("settingsBox").open = false;
  }
}

async function refreshAppStatus() {
  const { devices = {} } = await chrome.storage.local.get("devices");
  const paired = Object.keys(devices);
  if (paired.length) {
    $("appStatus").textContent = `웹 앱와 연결됨 · ${paired.join(", ")}에서 검사 작업을 받을 수 있습니다.`;
    $("appStatus").className = "ok small";
    $("openApp").textContent = "웹 앱에서 검사 시작";
    return true;
  }
  $("appStatus").textContent = "로그인한 웹 앱에서 검사 시작을 누르면 이 확장과 자동으로 연결됩니다. 연결 키를 직접 입력할 필요가 없습니다.";
  $("appStatus").className = "muted small";
  $("openApp").textContent = "웹 앱 열기";
  return false;
}

$("openApp").addEventListener("click", async () => {
  const target = server || DEFAULT_SERVER;
  await chrome.tabs.create({ url: `${target}/app` });
});

async function startRec(f) {
  try {
    const rec = await send("startRecording", { flow: f });
    showRecording(rec);
  } catch (e) {
    addLog({ at: Date.now(), text: e.message, kind: "error" });
  }
}

$("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  server = $("server").value.trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ server, token: $("token").value.trim(), offline: $("offline").checked, keyboard: $("keyboard").checked, review: $("review").checked });
  await refreshOffline();
  connect();
});

$("scanBtn").addEventListener("click", async () => {
  $("scanBtn").disabled = true;
  $("scanBtn").textContent = "검사 중…";
  try {
    await send("scanCurrent");
  } catch (e) {
    addLog({ at: Date.now(), text: e.message, kind: "error" });
  }
  $("scanBtn").disabled = false;
  $("scanBtn").textContent = "현재 화면 검사";
  refreshOffline();
});

$("recDone").addEventListener("click", async () => {
  await send("stopRecording", { save: true }).catch((e) => addLog({ at: Date.now(), text: e.message, kind: "error" }));
  showRecording(null);
  connect();
  refreshOffline();
});
$("recCancel").addEventListener("click", async () => {
  await send("stopRecording", { save: false });
  showRecording(null);
});
$("recCheck").addEventListener("click", () => send("recordNow").catch((e) => addLog({ at: Date.now(), text: e.message, kind: "error" })));
$("exportBtn").addEventListener("click", async () => {
  if (!(await chrome.permissions.request({ permissions: ["downloads"] }))) return addLog({ at: Date.now(), text: "파일 저장 권한을 허용하지 않았습니다.", kind: "warn" });
  const r = await send("export").catch((err) => ({ count: 0, err }));
  if (r.err) return addLog({ at: Date.now(), text: r.err.message, kind: "error" });
  addLog({ at: Date.now(), text: `${r.count}개 화면을 파일로 저장했습니다.`, kind: "ok" });
});
// 권한 요청은 클릭 처리기 안에서 바로 해야 한다 (사용자 동작이 필요)
$("allowCurrent").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let url = tab?.url;
  if (!url) url = prompt("허용할 사이트 주소를 입력하세요 (예: https://stage.example.go.kr)") || "";
  try {
    const origin = new URL(url).origin;
    const ok = await chrome.permissions.request({ origins: [`${origin}/*`] });
    addLog({ at: Date.now(), text: ok ? `${origin} 접근을 허용했습니다.` : "허용하지 않았습니다.", kind: ok ? "ok" : "warn" });
  } catch {
    addLog({ at: Date.now(), text: "주소를 확인해 주세요.", kind: "error" });
  }
  refreshOrigins();
});
$("allowCapture").addEventListener("click", async () => {
  const ok = await chrome.permissions.request({ origins: ["<all_urls>"] });
  addLog({ at: Date.now(), text: ok ? "화면 캡처를 허용했습니다." : "화면 캡처를 허용하지 않았습니다 (결과만 올립니다).", kind: ok ? "ok" : "warn" });
  refreshOrigins();
});
$("keyboard").addEventListener("change", async (e) => {
  if (e.target.checked) {
    const ok = await chrome.permissions.request({ permissions: ["debugger"] });
    if (!ok) e.target.checked = false;
  } else {
    await chrome.permissions.remove({ permissions: ["debugger"] });
  }
  await chrome.storage.local.set({ keyboard: e.target.checked });
});

$("pendingAll").addEventListener("click", () => send("pending:approve", { id: "all" }).then(refreshPending));
$("pendingNone").addEventListener("click", () => send("pending:discard", { id: "all" }).then(refreshPending));
$("clearBtn").addEventListener("click", async () => {
  await send("clearOffline");
  refreshOffline();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "pending:changed") refreshPending();
  if (msg.type === "log") {
    addLog(msg.entry);
    if (msg.recording) showRecording(msg.recording);
    refreshOffline();
  }
});

(async () => {
  const s = await chrome.storage.local.get(["server", "token", "offline", "keyboard", "review"]);
  server = s.server || "";
  $("server").value = server;
  $("token").value = s.token || "";
  $("offline").checked = Boolean(s.offline);
  $("keyboard").checked = s.keyboard === true && (await chrome.permissions.contains({ permissions: ["debugger"] }));
  refreshOrigins();
  $("review").checked = s.review !== false;
  refreshPending();
  const st = await send("status").catch(() => null);
  st?.log?.slice().reverse().forEach(addLog);
  showRecording(st?.recording);
  await refreshOffline();
  if (server && s.token) connect();
  else $("settingsBox").open = false;
  await refreshAppStatus();
})();
