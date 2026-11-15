# Phase 1: 자동검사 결과 AI 2차 검수

- 작성: 2026-10-24 · 기준 커밋 `a9ef0f8` 위 작업 (작성 시점에는 커밋 전)
- 상위 설계: [overall-improvement-design-2026-10.md](./overall-improvement-design-2026-10.md) §5·§6·§12 Phase 1
- **migration 0020·0021은 현재 설정된 대상 DB에 적용 완료했다.** 다른 운영 DB가 있다면 배포 전에 별도로 마이그레이션 상태를 확인해야 한다.

## 1. 판정 흐름

```text
1차 자동검사  finding (method=auto, result=fail|review)        ← 원본, 바꾸지 않음
      ↓  AI_VERIFY_ENABLED=1 · 프로젝트 AI 켜짐 · 회차당 상한 · 예산 상한
2차 AI 검수   finding_verification (supported|contradicted|uncertain|insufficient_evidence)
      ↓  routeVerification(): keep_signal | human_review | record_only  (결과 값은 바꾸지 않음)
3차 사람 확정  finding.human_result · item_decision                 ← 기존 그대로
```

| 자동 결과 | AI 결과 | 처리 |
|---|---|---|
| fail | supported (신뢰도 ≥ `AI_VERIFY_CONFIDENCE`, 기본 0.75) | 자동 신호 유지 (확정 아님) |
| fail | supported (신뢰도 낮음) · contradicted · uncertain | 사람 확인 필요 (pass 로 바꾸지 않음) |
| fail | insufficient_evidence | 기록만 |
| review | 무엇이든 | 사람 확인 필요 |
| pass | contradicted | 누락 의심 → 사람 확인 |
| pass | 그 밖 | 기록만 (AI 지지로 적합 확정하지 않음) |

자동 pass 는 DB 에 행으로 남지 않는다. pass 표본 검수와 사람 검토 큐는 Phase 2 에서 (화면, 항목) 단위로 추가했다: [phase-2-pass-sample-and-review-queue.md](./phase-2-pass-sample-and-review-queue.md).

## 2. 데이터 구조

`a11y.finding_verification` (drizzle/0020_finding_verification.sql, schema.ts `findingVerification`)

| 컬럼 | 설명 |
|---|---|
| scan_id, finding_id | FK, on delete cascade |
| verifier | `ai` \| `human` (지금은 ai 만 씀) |
| result | 4종, CHECK 제약 |
| confidence, evidence, reason_code | 관찰 근거는 고정 코드 + 60자 이내 한 구절 (가림 처리 후) |
| auto_result | 검수 당시 자동 결과 |
| provider, model, prompt_version | 모델·프롬프트(`VERIFY_PROMPT_VERSION = v1`) |
| input_hash | AI 에 보낸 입력(가림 처리 글 + 요소 주변 캡처)의 sha256 = 입력 증거 식별자 |

- 이력 표다. 수정·삭제하지 않고 추가만 한다.
- RLS 를 켠다. 워커 역할에는 SELECT·INSERT 만 준다 (0010 방식). `scripts/migrate-check.ts` 의 기대 권한에도 추가했다.
- 롤백: `DROP TABLE a11y.finding_verification;` (다른 표가 참조하지 않는다)
- migration 적용 전 DB 에서는 화면·서류 읽기가 실패하지 않도록 `loadScanView` 가 빈 목록으로 처리한다.
- 기능 플래그 `AI_VERIFY_ENABLED` 가 기본 꺼짐이라, 검수 저장 자체가 시도되지 않는다.

## 3. 개인정보·비용

입력 최소화 (`verificationInput`):

- 주소는 origin+경로만 보낸다 (`aiSafeUrl`).
- 메시지와 HTML 은 `redactText` 로 가리고 300자로 자른다. `value` 속성은 지운다.
- 캡처는 요소 주변 crop 만 보낸다. 보존기간이 지나 지운 캡처는 쓰지 않는다.

비용·호출 상한:

- 기본 꺼짐: `AI_VERIFY_ENABLED=1` 이고 프로젝트 `ai_enabled` 일 때만 동작한다.
- 회차당 `AI_VERIFY_MAX_PER_SCAN` (기본 30, 이미 검수한 수 포함) 까지만 검수한다.
- 한 번 실행에 20건까지 처리한다.
- 같은 입력 해시는 한 번만 묻는다.
- `callAI` 의 하루·전체 예산 상한을 그대로 따른다.

실패 처리:

- 예산 초과, AI 오류, 응답 형식 오류가 나면 아무것도 저장하지 않는다. 자동 결과만 남고 다음 실행 때 다시 시도한다.

## 4. 보고서 구분

| 구분 | 어디에 |
|---|---|
| 의미 후보 AI 판단 (이미지·링크·제목·표, method=ai) | 기존 그대로: Excel 문제 목록의 실제 결과 열, Word 근거 줄 "출처 AI 보조 판단 n건" |
| 자동검사 결과 AI 검수 (새 기능) | Excel "AI 검수" 시트 (있을 때만), Word 근거 줄 "AI 검증 (자동검사 결과 재검수·확정 아님): 검수 a/b곳 · AI 반박 n → 사람 확인 필요 n곳 · 모델 · 프롬프트", JSON `aiVerifications` |

- Excel "AI 검수" 시트는 열을 나눠 보여 준다: `1차 자동 결과` / `2차 AI 검증` / `3차 점검자 판정`, 그리고 신뢰도, 관찰 근거, 처리, 모델, 프롬프트, 시각, 입력 해시.
- Word 는 고정 문구만 쓴다. AI 관찰 문장은 Excel 에만 넣는다.
- 항목 상태, 문제 목록, 수치는 AI 검수 이력이 있든 없든 같다 (테스트로 고정).

## 5. 테스트

| 테스트 | 환경 | 결과 |
|---|---|---|
| `src/lib/ai/verify.test.ts` (처리 규칙·응답 해석·입력 최소화·대상 선정·기본 꺼짐) | Node 22 | Claude 작업 환경에서 통과 보고; 현재 로컬 Vitest는 기존 Vite/Vitest ESM 의존성 충돌로 기동 불가 |
| `src/lib/report/verification-report.test.ts` (원본 불변, Excel·Word·JSON 분리 표시) | Node 22 | Claude 작업 환경에서 통과 보고; 현재 로컬 Vitest는 기존 Vite/Vitest ESM 의존성 충돌로 기동 불가 |
| `tsc`, `next lint`, `git diff --check` | Node 22 | **통과** |
| migration 실제 적용·RLS·워커 권한 (`migrate-check.ts`) | 설정된 대상 DB | **통과**: 21개 일치·신규 DB 재적용·멱등성·RLS·워커 정책/권한 |
| 실제 워커 DB 역할 연결 (`test-worker-role.ts`) | `WORKER_DATABASE_URL` 필요 | **미실행**: 현재 환경변수 없음 |
| 실제 AI 호출 검수 품질 | Gemini API·비용 필요 | **실제 호출 1건 저장 통과**: 표본 검수 1건, 지원 판정, 신뢰도 0.9, 비용 약 `$0.0010`; 전체 품질 평가는 아님 |
| 실제 보고서 렌더(LibreOffice) | 렌더 환경 | **미실행** |

## 6. 다음 단계

1. 운영 워커의 `WORKER_DATABASE_URL`을 설정하고 실제 워커 역할 연결 테스트를 실행한다.
2. 소수 회차를 더 운영하며 지지·반박률과 비용을 기록하고 프롬프트를 조정한다.
3. 화면(ScanClient)에 AI 반박 위치를 사람 검토 큐 맨 앞에 보여 주는 UI를 추가한다. 현재는 큐 API까지 구현되어 있다.
4. 실제 Chromium 검사와 LibreOffice 보고서 렌더를 별도 회귀 환경에서 실행한다.
5. 사람 판정 변경 이력(`verifier=human` 또는 audit_events)을 추가한다.
