// 접근성 점검노트 웹 화면 ↔ 확장 연결 다리 (점검노트 사이트에서만 실행됨).
// 웹 화면이 window.postMessage 로 보낸 요청을 확장 백그라운드에 전하고 답을 돌려준다.
// 다른 사이트에서는 실행되지 않고(manifest matches), 같은 창·같은 출처에서 온 메시지만 받는다.
(() => {
  const version = chrome.runtime.getManifest().version;
  const mark = () => {
    document.documentElement.dataset.a11ynoteExt = version;
    window.dispatchEvent(new CustomEvent("a11ynote-ext", { detail: { version } }));
  };
  mark();
  document.addEventListener("DOMContentLoaded", mark);

  const ALLOWED = new Set(["hello", "pair", "run", "status"]);
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.source !== "a11ynote-page" || !ALLOWED.has(m.type)) return;
    const reply = (data) => window.postMessage({ source: "a11ynote-ext", id: m.id, ...data }, location.origin);
    chrome.runtime
      .sendMessage({ type: `auto:${m.type}`, ...(m.payload || {}) })
      .then((res) => reply(res && res.ok ? { ok: true, data: res.data } : { ok: false, error: res?.error || "확장 응답 없음" }))
      .catch((err) => reply({ ok: false, error: String(err?.message || err) }));
  });
})();
