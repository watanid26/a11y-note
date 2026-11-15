"use client";

import { useState, useTransition } from "react";
import { setAiEnabled } from "../../actions";
import { t } from "@/lib/client/t";

/** 이 사이트의 AI 판단 켜기/끄기 (새 사이트는 기본 켜짐. 캡처 일부가 외부 AI 로 간다) */
export default function AiToggle({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-start justify-between gap-6 border-y border-line py-4">
      <div>
        <p id="ai-label" className="font-semibold">{t("AI 판정", "AI判定")}</p>
        <p id="ai-desc" className="mt-0.5 text-sm text-muted">
          {t("자동 규칙으로 결론이 안 나는 항목을 AI가 캡처를 보고 판정해요. 다음 점검부터 적용되고, 캡처 일부가 AI로 전송돼요. 끄면 규칙으로 판정해요.", "ルールだけでは結論が出ない項目を、AIがキャプチャを見て判定します。次の点検から反映され、キャプチャの一部がAIに送られます。オフにするとルールで判定します。")}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="ai-label"
        aria-describedby="ai-desc"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setAiEnabled(projectId, !on);
            setOn(!on);
          })
        }
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full border-2 transition-colors ${on ? "border-brand bg-brand" : "border-muted bg-surface"}`}
      >
        <span aria-hidden className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${on ? "left-[22px] bg-on-brand" : "left-0.5 bg-muted"}`} />
        <span className="sr-only">{on ? t("켜짐", "オン") : t("꺼짐", "オフ")}</span>
      </button>
    </div>
  );
}
