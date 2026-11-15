"use client";

import { useState } from "react";

export default function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const id = `copy-${label}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input id={id} readOnly className="input font-mono text-xs" value={shown ? value : "•".repeat(24)} />
        {secret && <button type="button" className="btn-secondary" onClick={() => setShown((s) => !s)}>{shown ? "숨기기" : "보기"}</button>}
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}
