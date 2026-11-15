# 원본 보존 · 수동/보조기술/사용자 평가 · WCAG-EM 메타데이터 (2026-10-25)

판정 층(v1 자동 `finding` · v2 AI `finding_verification` · v3 점검자 `human_result`/`item_decision`)은 그대로 두고, 새 자료는 모두 **별도 표**에 쌓는다.
새 표가 없는 DB(마이그레이션 미적용)에서도 화면·서류는 `.catch(() => [])` 로 빈 목록을 받아 기존과 같게 동작한다.

## 1단계: axe 통과·해당 없음 원본, 기준 외 참고 (0022)
- 코어 0.3.0: `snapshot.ruleOutcomes`(axe passes·inapplicable 규칙 단위, 첫 요소 예시 1개)와 `snapshot.environment`(UA·언어·창·화면·배율·동작 줄이기·색 체계)를 함께 보낸다. 옛 확장(0.2.x)은 보내지 않으며 업로드 검증은 선택 항목으로 받는다.
- `page_evidence`: 화면당 1행. `unmapped_reference`: 연결표 밖 자동 결과(화면당 최대 500곳). 저장 실패는 경고만 남기고 업로드를 멈추지 않는다.
- 판정·문제 수·충돌·비교에 넣지 않는다. 서류: 점검표 "기준 외 참고"·"자동검사 통과·해당 없음" 시트(있을 때만), 보고서 부록 C 소절, 화면 JSON `references`·`ruleOutcomes`, 묶음 `references`·`methods.ruleOutcomePages`.

## 2단계: 수동 검사 · 보조기술 검사 · 장애인 사용자 평가 (0023)
- `manual_evaluation`: 쌓기만 한다. 정정은 새 행 + `supersedes`. 서류는 최신 판만 세고 이전 판은 이력으로 남긴다.
- 참여자는 가명 코드(`^[A-Za-z0-9_-]{1,20}$`)와 특성만. 메모·과업·조작 순서의 이메일·토큰 주소는 저장 전·내보낼 때 가린다. 서류에 점검자 계정은 `ab***@domain` 으로.
- API: `GET/POST /api/scans/[id]/evaluations` (로그인 + 회차 소유 확인, 연결한 화면·발견 사항·흐름·이전 기록이 같은 회차/프로젝트인지 확인).
- 항목 상태를 자동으로 바꾸지 않는다. 서류: 보고서 5장 소절(없으면 "기록 없음"), 점검표 시트, 묶음 `evaluations`·`methods.manualChecks/assistiveTech/userTesting`(0이면 "기록 없음").

## 3단계: WCAG-EM 표본 · 흐름 분기 · 환경 · 재현 절차 (0024)
- 무작위 표본: 구조적 표본의 10%(올림)를 아직 안 뽑힌 주소에서 고른다. 기준 주소+URL 해시로 정렬하므로 같은 주소 목록이면 같은 화면이 뽑힌다. 최대 수를 넘으면 가장 뒤의 틀 대표(홈·필수 아님)를 빼서 자리를 만든다. 선정 이유 `무작위 표본 (구조적 표본의 10%)`.
- `flow_branch`: 흐름의 주요 분기(조건·기대 결과·상태 planned/tested/blocked/na), 쌓기만 + `supersedes`. API `GET/POST /api/projects/[id]/flow-branches`.
- 환경: `page_evidence.environment` 로 화면별 브라우저·OS·창 크기. 보고서 "지원 기준"·점검표 "점검 범위"·묶음 `pages[].viewport/environments`, `issues[].state.viewport`.
- 재현 절차: 녹화된 흐름 단계 중 이 화면 주소에서 한 첫 조작 앞까지(못 찾으면 녹화 전체라고 밝힘, 최대 10단계) + 검사 환경. 없으면 기존 공통 절차.
- 묶음 `metadata.notRecorded` 는 고정 목록이 아니라 실제로 기록이 없는 항목만 적는다 (`missingRecords`).

## 적용 전 확인
- 마이그레이션 0020~0024 는 파일만 있음. 적용 전 `npx tsx scripts/migrate-check.ts` (빈 DB) 로 RLS·워커 권한 확인. 0023·0024 는 워커 권한 없음.
- 확장 zip(`public/a11ynote-extension.zip`)은 다시 만들지 않았다 (`npm run pack:ext`).
