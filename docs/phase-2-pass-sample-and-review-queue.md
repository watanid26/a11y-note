# Phase 2: 자동 pass 표본 AI 검수 + 사람 검토 큐

- 작성: 2026-10-24 · Phase 1([phase-1-ai-verification.md](./phase-1-ai-verification.md)) 후속 작업
- **migration 0020·0021은 현재 설정된 대상 DB에 적용 완료했다.** 다른 운영 DB가 있다면 배포 전에 별도로 마이그레이션 상태를 확인해야 한다.
- **0020 과 0021 은 함께 배포되는 변경이다.** Phase 1 코드(verify.ts)도 이제 `target` 열을 쓴다.

## 1. 원칙 (Phase 1 과 같음)

```text
1차 자동검사  finding · (pass 는 행 없음)                ← 원본, 읽기만
2차 AI 검증   finding_verification (append-only 이력)
              target=finding          : 자동 fail/review 위치 재검수 (Phase 1)
              target=auto_pass_sample : 자동 "문제 미발견" (화면, 항목) 표본 재검수 (Phase 2)
3차 사람 확정  finding.human_result (/review) · item_decision (/items)   ← 기존 경로 그대로
```

- AI 가 지지해도 pass 를 적합으로 확정하지 않는다 (`routeVerification` → 기록만).
- AI 가 반박하면 "누락 의심 → 사람 확인" 으로 큐에 올린다. 자동 결과·항목 상태·문제 목록은 바뀌지 않는다.

## 2. pass 표본 검수 (`src/lib/ai/verify-pass.ts`)

| 구분 | 내용 |
|---|---|
| 대상 항목 | 글자 근거로 볼 수 있는 4개 성공기준만: 2.4.2 제목(페이지 제목), 2.4.4 링크 목적(내비게이션 링크 문구), 2.4.1 반복 영역 건너뛰기(첫 Tab 위치), 2.4.3 초점 순서(Tab 순서·좌표). 팩 항목은 wcag 번호로 찾는다 (KWCAG 6.4.2 / 6.4.3 / 6.4.1 / 6.1.2) |
| 후보 | 그 화면·항목에 자동 finding 이 하나도 없고, 점검자가 항목을 결정하지 않았고, 같은 프롬프트로 아직 검수하지 않았고, 저장된 근거(제목·outline.navLinks·keyboard.stops)가 있을 때 |
| 표본 비율 | `AI_VERIFY_PASS_RATE` (기본 0.1). sha256(회차\|화면\|항목\|프롬프트 버전) 로 정하는 결정적 표본이라 다시 돌려도 같은 대상만 뽑힌다 |
| 회차 상한 | `AI_VERIFY_PASS_MAX_PER_SCAN` (기본 10, 이미 검수한 수 포함). 한 번 실행에 10건 |
| 중복 방지 | 코드: 이미 검수한 (화면, 항목, 프롬프트 버전) 제외. DB: 부분 고유 인덱스 `finding_verification_pass_uq` + `onConflictDoNothing` |
| 대상 회차 | 끝난 지 6시간 안의 `done` 회차, 프로젝트 `ai_enabled` 만, 한 번에 최대 5회차 |
| 켜기 | `AI_VERIFY_ENABLED=1` **그리고** `AI_VERIFY_PASS_ENABLED=1`. 기본 꺼짐 |
| 예산 | `callAI` 의 하루·전체 예산 상한. `BudgetExceeded` 면 그 실행을 멈춘다 |
| 실패 | AI 오류·응답 형식 오류·예산 초과면 아무것도 저장하지 않는다 (다음 실행에 같은 표본 재시도) |

외부로 보내는 입력 (`passSampleInput`):

- 글자만 보낸다. 캡처는 보내지 않는다.
- 주소는 origin+경로 (`aiSafeUrl`), 글자는 `redactText` 후 길이 제한. 선택자·입력값·쿼리는 보내지 않는다.
- 링크 30개, Tab 위치 25개(건너뛰기는 5개)까지.
- `input_hash` = 보낸 입력의 sha256.

워커 연결: `worker/main.ts` 와 `src/lib/scan/engine.ts` tick 에서 `processVerifications(20)` 다음에 `processPassSamples(10)`.

## 3. 사람 검토 큐 (`src/lib/verification-queue.ts`)

`GET /api/scans/[id]/verification-queue` (로그인 + 회차 소유 확인, 읽기 전용) → `{ total, entries }`

큐에 넣는 기준 (`needsHumanAfterAi`):

- 최신 AI 검수 결과가 contradicted · uncertain · insufficient_evidence
- 또는 처리 규칙이 사람 확인으로 보낸 것 (낮은 신뢰도 지지, 자동 review)
- 높은 신뢰도 지지(fail 유지, pass 기록만)는 넣지 않는다.

빼는 것:

- 점검자가 이미 `human_result` 를 정한 발견 사항
- 점검자가 항목을 결정(`item_decision`)한 표본

정렬과 묶음:

- AI 반박 → 보류 → 근거 부족 → (낮은 신뢰도) 지지 순서, 그 안에서 자동 fail → review → pass 순서
- 같은 문제 묶음은 한 줄로, 가장 앞선 결과를 대표로 두고 `findingIds` 에 묶음 전체를 담는다.

각 줄의 필드:

- `autoResult` (1차), `ai`·`confidence`·`evidence`·`reasonCode`·`route`·`model`·`promptVersion` (2차)
- `decideWith`: 사람 결정을 남길 곳. `review` 면 `POST /api/scans/[id]/review`, `item_decision` 이면 `POST /api/scans/[id]/items`

JSON 보고(`viewJson`)에는 `aiVerificationQueue`(대기 수)만 넣고, `aiVerifications` 에 표본 검수 행(문제 ID `-`, autoResult `pass`)이 함께 나온다. Excel "AI 검수" 시트에도 같은 행이 나온다.

## 4. 데이터 변경 (drizzle/0021_verification_pass_sample.sql)

- `finding_id` NOT NULL 해제
- `target` (`finding` 기본값 | `auto_pass_sample`), `page_state_id` (FK page_state, cascade), `item_code` 추가
- CHECK `finding_verification_target_chk`: finding 이면 finding_id 필수, 표본이면 finding_id 없음 + page_state_id·item_code 필수
- 부분 고유 인덱스: `(finding_id, verifier, prompt_version) WHERE target='finding'`, `(page_state_id, item_code, verifier, prompt_version) WHERE target='auto_pass_sample'`
- 권한·RLS 는 0020 그대로 (워커 SELECT·INSERT).
- 롤백 방법은 파일 머리말에 적었다. 표본 행을 먼저 지워야 NOT NULL 을 되돌릴 수 있다.
- 주의: 0020 을 이미 적용하고 같은 (finding, verifier, prompt_version) 이 두 번 저장된 DB 라면 고유 인덱스 생성이 실패할 수 있다. 현재 대상 DB에서는 중복 검증 결과를 확인한 뒤 인덱스 생성까지 완료했다.

## 5. 테스트

| 테스트 | 환경 | 결과 |
|---|---|---|
| `src/lib/ai/verify-pass.test.ts`: 기본 꺼짐, 설정값 경계, 결정적 표본, 비율, 후보 제외, 회차 상한, 입력 최소화, 해시 | Node 22 | Claude 작업 환경에서 통과 보고; 현재 로컬 Vitest는 기존 Vite/Vitest ESM 의존성 충돌로 기동 불가 |
| `src/lib/verification-queue.test.ts`: 큐 기준, 묶음, 점검자 판정 제외, 최신 검수만, 표본 항목 결정, 정렬, 원본 불변, JSON | Node 22 | Claude 작업 환경에서 통과 보고; 현재 로컬 Vitest는 기존 Vite/Vitest ESM 의존성 충돌로 기동 불가 |
| `tsc`, `next lint`, `git diff --check` | Node 22 | **통과** |
| 0020+0021 실제 적용·RLS·워커 권한 (`migrate-check.ts`) | 설정된 대상 DB | **통과**: 21개 일치·신규 DB 재적용·멱등성·RLS·워커 정책/권한 |
| 실제 워커 DB 역할 연결 (`test-worker-role.ts`) | `WORKER_DATABASE_URL` 필요 | **미실행**: 현재 환경변수 없음 |
| `processPassSamples` 의 DB 조회·저장 경로 | 설정된 대상 DB | **통과**: 실제 AI 표본 1건 저장 및 조회 검증 |
| 실제 AI 호출 품질·비용 | Gemini API | **실제 호출 1건 통과**: 비용 약 `$0.0010`; 광범위한 품질 평가는 아님 |
| Chrome 기반 검사 코어·서버 엔진 회귀 | 설치된 macOS Chrome + fixture | **통과**: 코어 결과 반환, 동시 점유·중간 저장·완료·집계·재실행 무시·tick 회귀 |
| Chrome 확장 전체 E2E | Playwright headless Chrome | **보류**: 이 환경에서 확장 서비스 워커가 로드되지 않음; 실제 일반 Chrome 세션에서 별도 확인 필요 |

## 6. 남은 제한

- 표본 대상은 4개 성공기준, 글자 근거뿐이다. 대비·대체 텍스트처럼 화면을 봐야 하는 항목은 표본에 넣지 않았다.
- Word 보고서에는 표본 검수를 넣지 않았다 (Excel·JSON 만).
- 검토 큐 화면(UI)은 없다. API 만 있다.
- 끝난 지 6시간이 지난 회차는 자동으로 표본 검수하지 않는다.
- 표본 비율은 회차 전체가 아니라 (화면, 항목) 단위다. 통계적 누락률 추정에 쓰려면 별도 설계가 필요하다.
