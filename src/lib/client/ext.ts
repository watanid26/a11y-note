"use client";
// 웹 화면 ↔ 크롬 확장(bridge.js) 대화. 확장이 설치돼 있으면 문서에 data-a11ynote-ext 표시가 붙는다.

export function extVersion(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.dataset.a11ynoteExt ?? null;
}

/** 확장 설치 여부 (확장 스크립트가 늦게 붙는 경우를 위해 잠깐 기다린다) */
export function detectExtension(waitMs = 1200): Promise<string | null> {
  const v = extVersion();
  if (v) return Promise.resolve(v);
  return new Promise((resolve) => {
    const on = () => {
      clearTimeout(t);
      resolve(extVersion());
    };
    const t = setTimeout(() => {
      window.removeEventListener("a11ynote-ext", on);
      resolve(extVersion());
    }, waitMs);
    window.addEventListener("a11ynote-ext", on, { once: true });
  });
}

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

export function callExt<T = unknown>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
  const id = Math.random().toString(36).slice(2);
  return new Promise<T>((resolve, reject) => {
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const m = e.data as { source?: string; id?: string } & Reply<T>;
      if (m?.source !== "a11ynote-ext" || m.id !== id) return;
      window.removeEventListener("message", on);
      clearTimeout(t);
      if (m.ok) resolve(m.data);
      else reject(new Error(m.error));
    };
    const t = setTimeout(() => {
      window.removeEventListener("message", on);
      reject(new Error("크롬 확장이 응답하지 않습니다. 확장을 다시 켜거나 페이지를 새로 고치세요."));
    }, timeoutMs);
    window.addEventListener("message", on);
    window.postMessage({ source: "a11ynote-page", id, type, payload }, location.origin);
  });
}

/** 로그인한 계정으로 확장을 연결한다 (키는 화면에 보이지 않고 확장으로 바로 넘어간다) */
export async function pairExtension(): Promise<void> {
  const res = await fetch("/api/ext/pair", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "확장을 연결하지 못했습니다.");
  await callExt("pair", { token: data.token });
}

/** 이 점검을 확장에 맡긴다. 연결이 안 돼 있으면 먼저 연결한다 */
export async function runInExtension(scanId: string): Promise<void> {
  const hello = await callExt<{ paired: boolean }>("hello");
  if (!hello.paired) await pairExtension();
  const r = await callExt<{ needPair?: boolean }>("run", { scanId });
  if (r?.needPair) {
    await pairExtension();
    await callExt("run", { scanId });
  }
}
