# 항목별 판정 출처 — JIS X 8341-3:2016 · 点検ノート対応表 r2

엔진: axe-core 4.14.0 (태그 wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice), 자체 규칙, 의미 판단 후보. 생성: 2026-10-09

| 항목 | 이름 | 방식 | 판정 출처 (규칙) | 자동 결과가 없을 때 | 해당 없음 조건 |
|---|---|---|---|---|---|
| 1.1.1 | 非テキストコンテンツ | ai | kr-captcha (자체 규칙), ai-image (의미 판단 후보), ai-captcha (의미 판단 후보), aria-meter-name (WCAG 1.1.1 연결), aria-progressbar-name (WCAG 1.1.1 연결), image-alt (WCAG 1.1.1 연결), input-image-alt (WCAG 1.1.1 연결), object-alt (WCAG 1.1.1 연결), role-img-alt (WCAG 1.1.1 연결), svg-img-alt (WCAG 1.1.1 연결) | 문제 미발견(자동) — 확정 아님 | images |
| 1.2.1 | 音声のみ及び映像のみ（収録済み） | manual | — | 검토 필요 (사람 확인) | media |
| 1.2.2 | キャプション（収録済み） | ai | ai-media (의미 판단 후보), video-caption (WCAG 1.2.2 연결) | 문제 미발견(자동) — 확정 아님 | media |
| 1.2.3 | 音声解説、又はメディアに対する代替（収録済み） | manual | — | 검토 필요 (사람 확인) | media |
| 1.2.4 | キャプション（ライブ） | manual | — | 검토 필요 (사람 확인) | media |
| 1.2.5 | 音声解説（収録済み） | manual | — | 검토 필요 (사람 확인) | media |
| 1.3.1 | 情報及び関係性 | auto | kr-table-caption (자체 규칙), ai-table (의미 판단 후보), aria-hidden-body (WCAG 1.3.1 연결), aria-required-children (WCAG 1.3.1 연결), aria-required-parent (WCAG 1.3.1 연결), definition-list (WCAG 1.3.1 연결), dlitem (WCAG 1.3.1 연결), list (WCAG 1.3.1 연결), listitem (WCAG 1.3.1 연결), p-as-heading (WCAG 1.3.1 연결), table-fake-caption (WCAG 1.3.1 연결), td-has-header (WCAG 1.3.1 연결), td-headers-attr (WCAG 1.3.1 연결), th-has-data-cells (WCAG 1.3.1 연결) | 문제 미발견(자동) — 확정 아님 | — |
| 1.3.2 | 意味のある順序 | ai · 사람 확인 | — | 검토 필요 (사람 확인) | — |
| 1.3.3 | 感覚的な特徴 | manual | — | 검토 필요 (사람 확인) | — |
| 1.4.1 | 色の使用 | manual | link-in-text-block (WCAG 1.4.1 연결) | 검토 필요 (사람 확인) | — |
| 1.4.2 | 音声の制御 | auto | kr-autoplay (자체 규칙), no-autoplay-audio (WCAG 1.4.2 연결) | 문제 미발견(자동) — 확정 아님 | media |
| 1.4.3 | コントラスト（最低限レベル） | auto | color-contrast (WCAG 1.4.3 연결) | 문제 미발견(자동) — 확정 아님 | — |
| 1.4.4 | テキストのサイズ変更 | manual | meta-viewport (WCAG 1.4.4 연결) | 검토 필요 (사람 확인) | — |
| 1.4.5 | 文字画像 | ai · 사람 확인 | — | 검토 필요 (사람 확인) | images |
| 2.1.1 | キーボード | auto | kr-click-only (자체 규칙), frame-focusable-content (WCAG 2.1.1 연결), scrollable-region-focusable (WCAG 2.1.1 연결), server-side-image-map (WCAG 2.1.1 연결) | 문제 미발견(자동) — 확정 아님 | — |
| 2.1.2 | キーボードトラップなし | auto | kr-keyboard-trap (자체 규칙) | 문제 미발견(자동) — 확정 아님 | — |
| 2.2.1 | タイミング調整可能 | ai | kr-meta-refresh (자체 규칙), meta-refresh (WCAG 2.2.1 연결) | 문제 미발견(자동) — 확정 아님 | timeLimitHint |
| 2.2.2 | 一時停止、停止及び非表示 | ai | kr-carousel-stop (자체 규칙), ai-carousel (의미 판단 후보), blink (WCAG 2.2.2 연결), marquee (WCAG 2.2.2 연결) | 문제 미발견(자동) — 확정 아님 | carousels |
| 2.3.1 | 3回のせん（閃）光、又は閾値以下 | manual | — | 검토 필요 (사람 확인) | — |
| 2.4.1 | ブロックスキップ | auto | kr-skip-link (자체 규칙), bypass (WCAG 2.4.1 연결) | 문제 미발견(자동) — 확정 아님 | — |
| 2.4.2 | ページタイトル | ai | ai-title (의미 판단 후보), document-title (WCAG 2.4.2 연결) | 문제 미발견(자동) — 확정 아님 | — |
| 2.4.3 | フォーカス順序 | ai · 사람 확인 | kr-focus-order (자체 규칙) | 검토 필요 (사람 확인) | — |
| 2.4.4 | リンクの目的（コンテキスト内） | ai | kr-generic-link (자체 규칙), ai-link (의미 판단 후보), area-alt (WCAG 2.4.4 연결), link-name (WCAG 2.4.4 연결) | 문제 미발견(자동) — 확정 아님 | — |
| 2.4.5 | 複数の手段 | manual | — | 검토 필요 (사람 확인) | — |
| 2.4.6 | 見出し及びラベル | ai · 사람 확인 | empty-heading (axe-core), heading-order (axe-core), page-has-heading-one (axe-core) | 검토 필요 (사람 확인) | — |
| 2.4.7 | フォーカスの可視化 | auto | kr-focus-indicator (자체 규칙) | 문제 미발견(자동) — 확정 아님 | — |
| 3.1.1 | ページの言語 | auto | html-has-lang (WCAG 3.1.1 연결), html-lang-valid (WCAG 3.1.1 연결), html-xml-lang-mismatch (WCAG 3.1.1 연결) | 문제 미발견(자동) — 확정 아님 | — |
| 3.1.2 | 一部分の言語 | manual | valid-lang (WCAG 3.1.2 연결) | 검토 필요 (사람 확인) | — |
| 3.2.1 | フォーカス時 | manual | — | 검토 필요 (사람 확인) | — |
| 3.2.2 | 入力時 | manual | — | 검토 필요 (사람 확인) | — |
| 3.2.3 | 一貫したナビゲーション | ai · 사람 확인 | — | 검토 필요 (사람 확인) | — |
| 3.2.4 | 一貫した識別性 | manual | — | 검토 필요 (사람 확인) | — |
| 3.3.1 | エラーの特定 | ai · 사람 확인 | — | 검토 필요 (사람 확인) | forms |
| 3.3.2 | ラベル又は説明 | auto | label (axe-core), select-name (axe-core), form-field-multiple-labels (WCAG 3.3.2 연결) | 문제 미발견(자동) — 확정 아님 | inputs |
| 3.3.3 | エラー修正の提案 | ai · 사람 확인 | — | 검토 필요 (사람 확인) | forms |
| 3.3.4 | エラー回避（法的、金融、データ） | manual | — | 검토 필요 (사람 확인) | forms |
| 4.1.1 | 構文解析 | auto | kr-duplicate-id (자체 규칙), duplicate-id-aria (axe-core) | 문제 미발견(자동) — 확정 아님 | — |
| 4.1.2 | 名前（name）、役割（role）及び値（value） | auto | area-alt (WCAG 4.1.2 연결), aria-allowed-attr (WCAG 4.1.2 연결), aria-braille-equivalent (WCAG 4.1.2 연결), aria-command-name (WCAG 4.1.2 연결), aria-conditional-attr (WCAG 4.1.2 연결), aria-deprecated-role (WCAG 4.1.2 연결), aria-hidden-body (WCAG 4.1.2 연결), aria-hidden-focus (WCAG 4.1.2 연결), aria-input-field-name (WCAG 4.1.2 연결), aria-prohibited-attr (WCAG 4.1.2 연결), aria-required-attr (WCAG 4.1.2 연결), aria-roles (WCAG 4.1.2 연결), aria-tab-name (WCAG 4.1.2 연결), aria-toggle-field-name (WCAG 4.1.2 연결), aria-tooltip-name (WCAG 4.1.2 연결), aria-valid-attr-value (WCAG 4.1.2 연결), aria-valid-attr (WCAG 4.1.2 연결), button-name (WCAG 4.1.2 연결), frame-title-unique (WCAG 4.1.2 연결), frame-title (WCAG 4.1.2 연결), input-button-name (WCAG 4.1.2 연결), input-image-alt (WCAG 4.1.2 연결), link-name (WCAG 4.1.2 연결), nested-interactive (WCAG 4.1.2 연결), summary-name (WCAG 4.1.2 연결) | 문제 미발견(자동) — 확정 아님 | — |

모든 항목은 점검자가 항목 단위로 확정해야 "적합·부적합·해당 없음" 이 된다. 화면이 없으면 "미검사".