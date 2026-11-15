# 항목별 판정 출처 — KWCAG 2.2 (2022) · 점검노트 연결표 r2

엔진: axe-core 4.14.0 (태그 wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice), 자체 규칙, 의미 판단 후보. 생성: 2026-10-09

| 항목 | 이름 | 방식 | 판정 출처 (규칙) | 자동 결과가 없을 때 | 해당 없음 조건 |
|---|---|---|---|---|---|
| 5.1.1 | 적절한 대체 텍스트 제공 | ai | image-alt (axe-core), input-image-alt (axe-core), area-alt (axe-core), role-img-alt (axe-core), svg-img-alt (axe-core), object-alt (axe-core), image-redundant-alt (axe-core), ai-image (의미 판단 후보), aria-meter-name (WCAG 1.1.1 연결), aria-progressbar-name (WCAG 1.1.1 연결) | 문제 미발견(자동) — 확정 아님 | images |
| 5.2.1 | 자막 제공 | ai | video-caption (axe-core), ai-media (의미 판단 후보) | 문제 미발견(자동) — 확정 아님 | media |
| 5.3.1 | 표의 구성 | ai | td-headers-attr (axe-core), th-has-data-cells (axe-core), td-has-header (axe-core), scope-attr-valid (axe-core), table-duplicate-name (axe-core), table-fake-caption (axe-core), empty-table-header (axe-core), kr-table-caption (자체 규칙), ai-table (의미 판단 후보) | 문제 미발견(자동) — 확정 아님 | tables |
| 5.3.2 | 콘텐츠의 선형구조 | ai · 사람 확인 | kr-focus-order (자체 규칙) | 검토 필요 (사람 확인) | — |
| 5.3.3 | 명확한 지시사항 제공 | manual | — | 검토 필요 (사람 확인) | — |
| 5.4.1 | 색에 무관한 콘텐츠 인식 | manual | link-in-text-block (axe-core) | 검토 필요 (사람 확인) | — |
| 5.4.2 | 자동 재생 금지 | auto | no-autoplay-audio (axe-core), kr-autoplay (자체 규칙) | 문제 미발견(자동) — 확정 아님 | media |
| 5.4.3 | 텍스트 콘텐츠의 명도 대비 | auto | color-contrast (axe-core) | 문제 미발견(자동) — 확정 아님 | — |
| 5.4.4 | 콘텐츠 간의 구분 | manual | — | 검토 필요 (사람 확인) | — |
| 6.1.1 | 키보드 사용 보장 | auto | scrollable-region-focusable (axe-core), frame-focusable-content (axe-core), nested-interactive (axe-core), kr-keyboard-trap (자체 규칙), kr-click-only (자체 규칙), server-side-image-map (WCAG 2.1.1/2.1.2 연결) | 문제 미발견(자동) — 확정 아님 | — |
| 6.1.2 | 초점 이동과 표시 | auto | tabindex (axe-core), focus-order-semantics (axe-core), kr-focus-indicator (자체 규칙) | 문제 미발견(자동) — 확정 아님 | — |
| 6.1.3 | 조작 가능 | auto | target-size (axe-core), kr-small-target (자체 규칙) | 문제 미발견(자동) — 확정 아님 | — |
| 6.1.4 | 문자 단축키 | manual | accesskeys (axe-core) | 검토 필요 (사람 확인) | — |
| 6.2.1 | 응답시간 조절 | ai | meta-refresh (axe-core), kr-meta-refresh (자체 규칙) | 문제 미발견(자동) — 확정 아님 | timeLimitHint |
| 6.2.2 | 정지 기능 제공 | ai | blink (axe-core), marquee (axe-core), kr-carousel-stop (자체 규칙), ai-carousel (의미 판단 후보) | 문제 미발견(자동) — 확정 아님 | carousels |
| 6.3.1 | 깜빡임과 번쩍임 사용 제한 | manual | — | 검토 필요 (사람 확인) | — |
| 6.4.1 | 반복 영역 건너뛰기 | auto | bypass (axe-core), skip-link (axe-core), kr-skip-link (자체 규칙) | 문제 미발견(자동) — 확정 아님 | — |
| 6.4.2 | 제목 제공 | ai | document-title (axe-core), frame-title (axe-core), frame-title-unique (axe-core), page-has-heading-one (axe-core), empty-heading (axe-core), heading-order (axe-core), ai-title (의미 판단 후보) | 문제 미발견(자동) — 확정 아님 | — |
| 6.4.3 | 적절한 링크 텍스트 | ai | link-name (axe-core), kr-generic-link (자체 규칙), ai-link (의미 판단 후보) | 문제 미발견(자동) — 확정 아님 | — |
| 6.4.4 | 고정된 참조 위치 정보 | manual | — | 검토 필요 (사람 확인) | — |
| 6.5.1 | 단일 포인터 입력 지원 | manual | — | 검토 필요 (사람 확인) | — |
| 6.5.2 | 포인터 입력 취소 | manual | — | 검토 필요 (사람 확인) | — |
| 6.5.3 | 레이블과 네임 | auto | label-content-name-mismatch (axe-core) | 문제 미발견(자동) — 확정 아님 | — |
| 6.5.4 | 동작기반 작동 | manual | — | 검토 필요 (사람 확인) | — |
| 7.1.1 | 기본 언어 표시 | auto | html-has-lang (axe-core), html-lang-valid (axe-core), valid-lang (axe-core), html-xml-lang-mismatch (axe-core) | 문제 미발견(자동) — 확정 아님 | — |
| 7.2.1 | 사용자 요구에 따른 실행 | auto | kr-new-window (자체 규칙) | 문제 미발견(자동) — 확정 아님 | — |
| 7.2.2 | 찾기 쉬운 도움 정보 | ai · 사람 확인 | — | 검토 필요 (사람 확인) | — |
| 7.3.1 | 오류 정정 | ai · 사람 확인 | — | 검토 필요 (사람 확인) | forms |
| 7.3.2 | 레이블 제공 | auto | label (axe-core), select-name (axe-core), form-field-multiple-labels (axe-core), label-title-only (axe-core) | 문제 미발견(자동) — 확정 아님 | — |
| 7.3.3 | 접근 가능한 인증 | ai | kr-captcha (자체 규칙), ai-captcha (의미 판단 후보) | 문제 미발견(자동) — 확정 아님 | captchas |
| 7.3.4 | 반복 입력 정보 | manual | autocomplete-valid (axe-core) | 검토 필요 (사람 확인) | — |
| 8.1.1 | 마크업 오류 방지 | auto | kr-duplicate-id (자체 규칙), duplicate-id-aria (axe-core), list (axe-core), listitem (axe-core), definition-list (axe-core), dlitem (axe-core) | 문제 미발견(자동) — 확정 아님 | — |
| 8.2.1 | 웹 애플리케이션 접근성 준수 | auto | button-name (axe-core), input-button-name (axe-core), aria-command-name (axe-core), aria-input-field-name (axe-core), aria-toggle-field-name (axe-core), aria-required-attr (axe-core), aria-valid-attr (axe-core), aria-valid-attr-value (axe-core), aria-roles (axe-core), aria-allowed-attr (axe-core), aria-hidden-focus (axe-core), aria-required-children (axe-core), aria-required-parent (axe-core), aria-hidden-body (axe-core), aria-braille-equivalent (WCAG 4.1.2 연결), aria-conditional-attr (WCAG 4.1.2 연결), aria-deprecated-role (WCAG 4.1.2 연결), aria-prohibited-attr (WCAG 4.1.2 연결), aria-tab-name (WCAG 4.1.2 연결), aria-tooltip-name (WCAG 4.1.2 연결), summary-name (WCAG 4.1.2 연결) | 문제 미발견(자동) — 확정 아님 | — |

모든 항목은 점검자가 항목 단위로 확정해야 "적합·부적합·해당 없음" 이 된다. 화면이 없으면 "미검사".