# 통합 점검 묶음 (A) · 워커 운영 (B) · 기준 연결·증거 (C)

- 작성: 2026-10-24 · 기준 커밋 `29d6597` 위 working tree 변경 (커밋 안 함)
- **DB migration 을 만들지 않았다.** 통합 묶음은 기존 표를 읽기만 하고, 워커 변경은 기존 `ops_log.detail`(jsonb)에 값만 더 넣는다.
- 요청 메시지의 한글 일부가 전달 중 빠져 있어, 남은 영어·기호와 기존 설계 문서로 범위를 읽었다. 읽은 내용은 아래 각 절 첫 줄에 적었다.

## A. 서버 자동검사 + 크롬 확장 검사 통합 묶음

읽은 요구: 프로젝트(사이트) 단위로 서버 검사와 확장 검사 결과를 합친 점검 묶음(report bundle)과 API, 중복 제거, 판정 이력(v1 자동 · v2 AI · v3 점검자), 출처(서버 자동 / 크롬 확장 / AI / 점검자), 주소·화면 크기·상태, Word·Excel·JSON 내보내기.

| 파일 | 내용 |
|---|---|
| `src/lib/bundle.ts` | 순수 함수 `buildProjectBundle(views)`, `pickBundleScans`, `bundleSource` |
| `src/lib/bundle-load.ts` | 회차 고르기·불러오기 (읽기 전용, 같은 프로젝트만, 최대 6회차, 끝난 회차만) |
| `src/lib/report/bundle-export.ts` | `bundleJson` · `bundleXlsx` · `bundleDocx` |
| `src/app/api/projects/[id]/bundle/route.ts` | `GET ?format=json\|xlsx\|docx&scans=<id>,<id>` (로그인 + `ownedProject`) |

규칙:

- 회차: `scans` 를 주지 않으면 출처(서버 `server` · 크롬 확장 `browser`/`extension` · 파일 `file`)마다 가장 최근에 끝난 회차 하나씩. `fixture` 회차는 넣지 않는다.
- 중복 제거 키: 화면 키(`compare.ts` 의 `pageKey` = 쿼리 뺀 주소 + 흐름 단계) + 항목 + 규칙 + 요소. 출처가 달라도 같은 키면 한 줄이고 `sources`·`occurrences` 에 원본 회차·발견 사항 id 를 모두 남긴다.
- 판정 이력(`layers`): v1 = 자동 규칙, v2 = AI 보조 판단(method=ai)과 AI 검증(finding_verification), v3 = 점검자(human_result, method=manual). 위 층이 아래 층을 덮어쓰지 않는다.
- 충돌은 고르지 않고 표시만 한다:
  - `source_disagree`: 같은 화면을 두 출처가 봤는데 한쪽만 문제를 냄 (그 화면을 보지 않은 출처는 충돌로 치지 않음, 예: 로그인 뒤 화면)
  - `human_disagree`: 회차마다 점검자 판정이 다름
  - `ai_contradicts`: AI 검증이 자동 결과를 반박
- `combined`(통합 참고값)은 표시용이며 확정 판정이 아니다. 점검자 판정이 하나로 모이면 그것, 충돌이면 `review`, 아니면 출처 중 가장 나쁜 결과. 모든 내보내기에 이 안내 문구를 넣는다.
- 항목: 출처별 상태를 나란히 두고, 점검자 결정이 다르거나 점검자가 적합으로 정했는데 다른 출처에 자동 신호가 남으면 `review` + 충돌.
- 개인정보: `loadScanView`/`buildScanView` 의 가림 처리(주소 쿼리·본문)를 그대로 거친다.
- 화면 크기(viewport): DB 에 저장하지 않으므로 `null` / "기록 없음". 추정하지 않는다.

내보내기:

- JSON: 묶음 전체 + 안내·면책 문구. 원본 회차·발견 사항 id 로 되찾아 갈 수 있다.
- Excel: 묶음 요약 · 항목(출처별 열) · 통합 문제(v1/v2/v3·출처·충돌 열) · 판정 이력(층마다 한 줄, 모델·프롬프트·시각·id) · 화면.
- Word: 회차 표 · 요약 · 항목별 출처 비교 · 충돌 표. 발견 사항별 이력은 Excel·JSON 에만 둔다.

## B. 워커·대기열 운영

읽은 요구: DB 대기열(`for update skip locked`·lease), 대기열·처리 중·실패·워커 생존 신호를 볼 API, `deploy/run-worker.sh` 런북, 생존 확인, 정상 종료, 여러 대 실행, 특정 클라우드에 묶이지 않기.

이미 있던 것 (확인만): `worker/main.ts` 의 `for update skip locked` 회차 가져가기, 서버리스 경로의 `lease_until`, 멈춘 회차 정리(`recoverStuck`), 5분 생존 신호, `/api/internal/status`·`ops-status.ts` 경보, 공개 `/api/health`(DB 연결만).

이번에 더한 것:

| 파일 | 내용 |
|---|---|
| `src/lib/ops/worker-life.ts` | 워커 id(`WORKER_ID`), 상태(starting·idle·busy·stopping), 상태 파일 원자적 쓰기, 종료 유예 시간 |
| `scripts/worker-health.mjs` | 상태 파일로 생존 확인 (종료 코드 0/1, DB·네트워크 없음, tsx 없이 실행) |
| `worker/main.ts` | SIGTERM/SIGINT 정상 종료, 15초마다 상태 파일, 생존 신호에 워커 id·상태 |
| `src/app/api/internal/heartbeat/route.ts` | 워커 id·상태를 `ops_log.detail` 에 기록 (값 검증) |
| `src/lib/ops/health.ts` | `workersAlive`, `queue.queued`, `queue.running` |
| `deploy/run-worker.sh` | `WORKER_ID`, `--stop-timeout 70`, `--health-cmd node scripts/worker-health.mjs` |
| `docs/runbook-deploy.md` | 여러 대·정상 종료·생존 확인 절 |

정상 종료에서 진행 중 회차를 다시 대기열에 넣지 않는 이유: 이미 화면·발견 사항 일부가 저장돼 있어 다시 돌리면 중복된다. 기존 `recoverStuck` 과 같은 "실패(사용량 차감 없음)" 로 정리한다.

## C. 기준 연결·증거·재검사 (설계만, 코드 변경 없음)

읽은 요구: KWCAG 항목과 axe 규칙 연결표의 검증, WCAG·KWCAG·ACT 규칙 대응, 증거(캡처·DOM·선택자)와 AI 근거의 구분, 재검사 차이.

지금 상태와 다음 단계:

1. 연결표: `src/core/packs/kwcag22.ts` 의 `KWCAG22_RULE_MAP` 이 axe 규칙 → KWCAG 항목을 정한다. 2026-10 감사에서 연결 없이 빠지는 axe 규칙 21개를 찾았다 (`docs/iteration-2-unmapped-storage-report-plan.md`). 이 결정(저장 여부·보존기간 등 5개)이 아직 사용자 결정 대기다.
2. ACT 규칙 대응: axe 규칙마다 W3C ACT 규칙 id 를 붙이는 표가 필요하다. axe 메타데이터의 `actIds` 를 그대로 옮기는 방식이 가장 안전하다 (추정 매핑 금지). 원문 확인 전에는 코드로 넣지 않는다.
3. 증거: 지금 발견 사항은 선택자·HTML 조각·좌표·캡처 키를 갖고, AI 검증은 `input_hash` 로 보낸 입력을 식별한다. 묶음의 판정 이력에 이 id 들이 남는다. 화면 크기는 저장하지 않으므로, 저장하려면 `page_state` 에 열을 더하는 migration 이 필요하다 (승인 필요).
4. 재검사: `src/lib/compare.ts` 가 회차 간 차이(new·resolved·persisting·changed·incomparable)를 이미 계산한다. 통합 묶음과 같은 키를 쓰므로, 다음 단계는 "묶음 대 묶음" 비교를 같은 함수로 확장하는 것이다.

## 테스트

| 테스트 | 결과 |
|---|---|
| `src/lib/bundle.test.ts` (16): 회차 고르기, 프로젝트 섞임 거부, 출처 합치기, 점검자·출처·AI 충돌, 로그인 뒤 화면, v1/v2/v3 층, 항목 충돌, 원본 불변, JSON 가림, Excel 시트·열, Word 문구 | 통과 |
| `src/lib/ops/worker-life.test.ts` (7): 워커 id, 유예 시간, 종료 요청, 상태 파일 원자 쓰기, 생존 확인 판단, 확인 스크립트가 DB·네트워크를 쓰지 않음 | 통과 |
| 전체 vitest, tsc, next lint, git diff --check | 통과 |
| 실제 DB 로 묶음 API 호출, 실제 워커 종료(docker stop), HEALTHCHECK 동작 | **미실행** (DB·Docker 필요) |
| 실제 AI 호출, Chromium 회귀, 외부 사이트 검사 | **미실행** (지시로 제외) |

## 남은 제한

- 묶음 화면(UI)은 없다. API 와 내보내기만 있다.
- 화면 크기는 저장하지 않아 "기록 없음"이다.
- 묶음은 요청할 때마다 계산한다 (저장하지 않음). 회차가 많으면 6개 상한 안에서 고른다.
- 워커 상태 파일 경로는 쓰기 가능한 곳이어야 한다 (`run-worker.sh` 는 `/tmp` tmpfs).
