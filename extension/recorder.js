// 녹화 중 페이지 안에서 도는 스크립트.
// - 클릭·입력을 단계로 기록 (크롬 녹화 기능과 비슷한 형식, 입력값은 저장하지 않음)
// - 팝업이 열리거나 내용이 크게 바뀌면 "화면이 바뀜"을 알려 자동 검사하게 함
// - 결제·확정·탈퇴 같은 되돌릴 수 없는 버튼은 녹화 중에 막는다
(() => {
  if (window.__a11yRecorder) return;
  const DANGER = /결제|구매하기|주문\s?(하기|완료)|예약\s?확정|신청\s?완료|접수\s?완료|탈퇴|삭제|송금|이체|pay|purchase|checkout|place order|delete|remove account|確定|購入|退会|削除/i;
  let active = false;
  let extraStop = null;
  let timer = null;
  let lastText = "";
  let clickedAt = 0;

  /** 화면 상태 서명: 보이는 글자 + 보이는 입력칸 수 (녹화 안내 띠는 제외) */
  function signature() {
    const text = (document.body?.innerText || "").replace(/"[^"]{0,40}" 버튼은 실제로 실행되므로[^\n]*/g, "").slice(0, 6000);
    const controls = [...document.querySelectorAll("input:not([type=hidden]), select, textarea, button")].filter((el) => el.offsetParent !== null).length;
    return { text, controls };
  }
  let last = { text: "", controls: 0 };

  function selectorOf(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && parts.length < 6) {
      const tag = cur.tagName.toLowerCase();
      const same = cur.parentElement ? [...cur.parentElement.children].filter((c) => c.tagName === cur.tagName) : [];
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
      if (cur.id) {
        parts[0] = `#${CSS.escape(cur.id)}`;
        break;
      }
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function nameOf(el) {
    return (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 60);
  }

  function banner(text) {
    let b = document.getElementById("__a11y_rec_banner");
    if (!b) {
      b = document.createElement("div");
      b.id = "__a11y_rec_banner";
      b.setAttribute("role", "status");
      b.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;max-width:420px;padding:10px 14px;border-radius:8px;background:#7f1d1d;color:#fff;font:14px/1.5 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3)";
      document.documentElement.appendChild(b);
    }
    b.textContent = text;
    clearTimeout(b.__t);
    b.__t = setTimeout(() => b.remove(), 6000);
  }

  function onClick(e) {
    if (!active) return;
    const el = e.target.closest("button, a, input[type=submit], input[type=button], [role=button]");
    if (!el) return;
    const text = nameOf(el);
    if (DANGER.test(text) || (extraStop && extraStop.test(text))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      banner(`"${text}" 버튼은 실제로 실행되므로 녹화 중에는 막았습니다. 이 직전 화면까지면 충분합니다.`);
      chrome.runtime.sendMessage({ type: "recorder:blocked", text });
      return;
    }
    clickedAt = Date.now();
    chrome.runtime.sendMessage({ type: "recorder:step", step: { type: "click", selectors: [[selectorOf(el)]], text, url: location.href } });
  }

  function onChange(e) {
    if (!active) return;
    const el = e.target;
    if (!el.matches?.("input, select, textarea")) return;
    const sensitive = el.type === "password" || /pass|pw|ssn|주민|card|카드|계좌|account|phone|tel|전화|email/i.test(`${el.name} ${el.id} ${el.autocomplete}`);
    chrome.runtime.sendMessage({ type: "recorder:step", step: { type: "change", selectors: [[selectorOf(el)]], value: sensitive ? "{{입력값 비공개}}" : el.tagName === "SELECT" ? el.value : "{{입력값}}", url: location.href } });
  }

  // 팝업·단계 전환처럼 화면이 크게 바뀌었을 때 알린다 (페이지 이동은 백그라운드가 따로 잡는다)
  const observer = new MutationObserver(() => {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const now = signature();
      const dialog = document.querySelector("dialog[open], [role=dialog]:not([hidden]), [aria-modal=true]");
      const lenDiff = Math.abs(now.text.length - last.text.length);
      const afterClick = Date.now() - clickedAt < 4000;
      const changed =
        now.text !== last.text &&
        (lenDiff > 80 || now.controls !== last.controls || (dialog && !last.text.includes((dialog.innerText || "").slice(0, 30))) || (afterClick && lenDiff > 5));
      if (changed) {
        last = now;
        chrome.runtime.sendMessage({ type: "recorder:changed", reason: dialog ? "팝업 열림" : afterClick ? "버튼을 누른 뒤 화면 바뀜" : "화면 내용 바뀜" });
      }
    }, 900);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "recorder:start") {
      active = true;
      last = signature();
      try {
        extraStop = msg.stopBefore ? new RegExp(msg.stopBefore.split(/[·,\/]| 버튼/).map((s) => s.trim()).filter((s) => s.length >= 2).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "(?!)") : null;
      } catch {
        extraStop = null;
      }
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "open", "aria-hidden", "class", "style"] });
    }
    if (msg.type === "recorder:stop") {
      active = false;
      observer.disconnect();
    }
  });
  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  window.__a11yRecorder = true;
})();
