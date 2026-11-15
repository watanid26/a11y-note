# 2차 반복 설계: 기준 외 참고(unmapped_reference) 저장·화면·보고서 연결

- 작성: 2026-10-24 · 상태: **설계만 있음 (구현 안 함)**
- 기준 브랜치: `codex/a11ynote-accessibility-iteration-1` (스냅샷 474601a) + 1차 working tree 변경
- 근거: 이 저장소의 현재 코드, 1차 패치(`src/core/judge.ts`, `src/core/result-status.ts`), 분석 문서(점검·보고서 정확도 계획 문서 D·E절), `docs/refs/`
- 이 문서는 공식 기준을 새로 해석하지 않는다. 품질인증 심사 점수·페이지 선정·사용자 심사는 다루지 않는다 (원문 미확보).

> **승인 전에는 하지 않는 것**: DB migration 작성·실행, 로컬 DB 통합 테스트, 실제 보고서(Excel·Word) 렌더 검증, 커밋·push.

---

## 1. 현재 코드 흐름

```
브라우저(core/page) ─ CapturedState ─▶ src/lib/ingest.ts  ingestState()
   │                                     ├─ page_state 1행 insert (url·title·label 은 redactUrl/redactText)
   │                                     ├─ scan.pack_version / engine_version 갱신
   │                                     └─ findingsFromState(pack, state) → finding N행 insert
   │                                          (message·html 은 redactText, 200행씩 나눠 insert)
   ▼
DB  a11y.page_state · a11y.finding · a11y.item_decision
   ▼
src/lib/scan-view.ts  loadScanView() → buildScanView()
   ├─ 화면·서류용 redaction 다시 적용 (예전 저장분 보호)
   ├─ 예전 저장 target-size fail → review (legacyTarget)
   ├─ summarizeItems() → items (항목 33개 상태)
   ├─ groupFindings() → groups (항목·규칙·선택자·결과별 묶음)
   └─ pending / toReview 수
   ▼
src/lib/report/model.ts  itemRows() · issueRecords() · reportMetrics()
   ├─ src/lib/report/checklist.ts  Excel: 요약 / 자체진단 점검표 / 문제 목록 / 점검 범위
   ├─ src/lib/report/docx.ts       Word: 1~8장 + 부록 A(검사한 화면)·B(판정 용어)·C(참고자료)
   └─ src/lib/view-json.ts         검사 화면 JSON (items·groups·metrics·pages)
```

**1차 패치 이후 현재 상태**

- `findingsFromState()` 는 연결 항목이 없는 결과를 여전히 반환하지 않는다. 반환 타입과 호출부는 바뀌지 않았다.
- 기준 외 참고는 `unmappedReferencesFromState()` 로만 꺼낼 수 있다. ingest 에서 아직 호출하지 않아 **저장되지 않는다.**
- `classifyState()`·`classifyItem()`·`blockedPolicies()` 는 분류 어댑터일 뿐이다. 화면·보고서에서는 아직 쓰지 않는다.
- 대상 규모: 연결표 감사(axe 4.14.0)에서 KWCAG 팩에 연결되지 않는 axe 규칙은 21개였다.
  - p-as-heading, meta-viewport, css-orientation-lock, avoid-inline-spacing
  - landmark·region 9개
  - ARIA best-practice 6개 등
- JIS 팩에서는 한국 자체 규칙(kr-new-window 등)도 기준 외 참고로 나온다 (`unmappedReferencesFromState` 는 engine 을 가리지 않는다). 이것을 저장할지는 §6 결정 항목으로 둔다.

## 2. 저장 방식 비교

### 2-A. 별도 테이블 `a11y.unmapped_reference` (권장)

| 컬럼 | 형 | 비고 |
|---|---|---|
| id | uuid PK default random | |
| scan_id | uuid not null → scan.id **on delete cascade** | 계정 삭제(scan cascade)와 같이 지워짐 |
| page_state_id | uuid not null → page_state.id **on delete cascade** | |
| pack_id | text not null | 어느 팩 기준으로 "연결 안 됨"이었는지. 팩마다 결과가 다르다 |
| pack_version | text | 연결표 버전. 연결표가 바뀌면 같은 규칙이 연결될 수 있다 |
| engine | text not null | `axe` \| `custom` |
| rule_id | text not null | |
| outcome | text not null | `violation` \| `incomplete` |
| wcag | jsonb `string[]` not null default `[]` | 도구가 붙인 SC (판정 근거 아님) |
| message | text not null | **redactText 후** 1000자 |
| selector | text not null default '' | 500자 |
| html | text not null default '' | **redactText 후** 1000자, `value=""` 는 page 단계에서 이미 제거 |
| box | jsonb | 캡처 위 위치 |
| created_at | timestamptz not null default now() | |

인덱스·보안:

- `unmapped_reference_scan_idx (scan_id)`
- `unmapped_reference_page_idx (page_state_id)`
- 기존 표와 같이 RLS 를 켠다 (`0001_enable_rls.sql` 방식).
- 워커 역할 `a11y_worker` 에 SELECT·INSERT 권한과 정책을 준다 (`0002`/`0003` 방식). 정책이 없으면 RLS 때문에 0행이 된다.

장점:

- finding 을 읽는 모든 코드에 영향이 없다. 수치와 항목 판정에 섞일 길이 구조적으로 없다.
- 기존 cascade 삭제와 보존 정책을 그대로 따른다.

단점:

- migration 1개가 필요하다.
- 배포 순서를 지켜야 한다. migration 을 먼저 적용하지 않으면 insert 가 실패한다 (§5).

### 2-B. finding 표 확장 (비권장)

- `item_code` 가 `not null` 이라 예약 코드(예: `"ref"`)를 넣어야 한다.
  - `summarizeItems` 는 팩 항목만 돌아서 항목 상태에는 안 섞인다.
  - 그러나 `groupFindings`·`issueRecords`·`toReview`·`compareScans`(재검사 비교)·`plain.ts`·`viewJson.groups` 는 모든 finding 을 그대로 읽는다. 걸러 내지 않으면 **문제 목록 P-xxx, 검토 필요 수, 재검사 신규/해결 수에 섞인다.**
- 걸러 내는 조건을 읽는 곳마다 넣어야 하고, 하나라도 빠지면 수치가 틀린다.
- `result` 값 `fail`/`review` 를 넣으면 기존 의미(판정)와 충돌한다. 새 값을 만들면 `effectiveResult` 등 판정 경로 전체를 손봐야 한다.
- 장점은 migration 이 없다는 점 하나뿐이다.

### 2-C. page_state JSON 컬럼만 사용 (비권장)

- `page_state.references jsonb` 처럼 화면 행에 배열로 넣는 방식이다.
- 컬럼 추가라서 migration 은 여전히 필요하다.
- 규칙·위치별 조회·집계·인덱스가 어렵다. 회차 전체 집계는 모든 화면 JSON 을 펼쳐야 한다.
- 화면 하나에 수백 위치가 나오면 행이 커지고, 화면 목록을 읽을 때마다 함께 읽힌다.
- 위치 단위로 redaction·잘라내기·보존 처리를 따로 할 수 없다. 나중에 위치별 증거 해시를 붙이기도 어렵다.

**결론**: 2-A. finding 과 물리적으로 분리하는 것이 "판정에 섞지 않는다"는 정책을 가장 확실히 지킨다.

## 3. 화면·수치 분리 규칙

| 대상 | 기준 외 참고 포함? |
|---|---|
| `summarizeItems` 항목 상태 (33개) | **아니오** |
| 자동 신호·부적합 수, 검토 필요 수(`toReview`), 판정 대기(`pending`) | **아니오** |
| `reportMetrics` (기준·유형·위치·화면 수) | **아니오** |
| 문제 목록 P-xxx (`issueRecords`) | **아니오** |
| 재검사 비교 (`compareScans`) 신규·해결·유지 | **아니오** (1단계). 참고 목록 비교는 별도 후속 |
| 별도 "기준 외 참고 N건(규칙 k개)" 수와 목록 | **예**, 따로 표시 |

구현 원칙:

- `ScanView` 에 `references` 필드를 **추가만** 한다. 기존 `findings`·`items`·`groups` 의 내용과 수는 바뀌지 않는다.
- 보여 줄 때는 규칙 ID로 묶어 위치 수를 센다 (`classifyReference` → `unmapped_reference`).
- 문구는 "판정에 반영하지 않는 참고 결과"로 고정한다. "부적합", "위반" 같은 판정 용어를 쓰지 않는다.
- 사람 확인(humanResult) 대상이 아니다. 검토 버튼을 두지 않는다.

같은 반복에서 함께 다룰 화면 정책 (저장과 무관):

- 1차 정책은 **새로 검사한 결과에만** 적용된다. 예전에 저장된 6.1.3·7.2.1·5.3.1 자체 규칙 fail 행은 그대로 남아 있다.
- 그래서 `buildScanView` 에서 `legacyTarget` 과 같은 방식으로, 위 세 규칙의 예전 fail 을 화면에서 review 로 보여 준다.
- 판정은 `ADVISORY_RULES` 를 그대로 재사용하고, DB 값은 고치지 않는다.

## 4. 출력 최소 설계

**Excel (`checklist.ts`)**

- 기준 외 참고가 있을 때만 4번째 시트 "기준 외 참고" (JIS: "基準外参考") 를 추가한다.
- 1행: 안내문 (병합 셀).
  - "이 점검 기준의 어느 검사항목에도 연결되지 않은 자동 검사 결과입니다. 적합·부적합 판정과 문제 수에 넣지 않습니다."
- 열: 규칙 ID · WCAG(도구 표기) · 규칙 설명 · 화면명(캡처 ID S01…) · 전체 URL · 선택자 · 도구 메시지
- 기존 시트 이름과 열은 바꾸지 않는다. `docs.test.ts` 는 기존 시트를 이름으로 찾으므로 영향이 없어야 한다.

**Word (`docx.ts`)**

- 부록 C(참고자료) 안에 소제목 하나만 추가한다: "기준 외 참고 (검사항목에 연결되지 않은 자동 검사 결과)".
- 표: 규칙 ID · WCAG(도구 표기) · 규칙 설명 · 위치 수. 위치 상세는 Excel 시트를 보라고 적는다.
- `T.sections` 목록(장 제목)은 바꾸지 않는다.
- 결론 요약·6장 수치에는 넣지 않는다.

**JSON (`view-json.ts`)**

```ts
references: {
  total: number;          // 위치 수
  rules: { ruleId: string; wcag: string[]; summary: string; count: number; pages: string[] }[];
}
```

- 기존 필드는 그대로 두고 추가만 한다. 위치 상세는 필요할 때 별도 API 로 내준다 (응답 크기 보호).

## 5. 호환성·migration·rollback, redaction·보존·증거 해시

**하위 호환**

- 새 표가 비어 있으면 화면·서류는 지금과 같다. 예전 회차는 참고 결과가 없는 것으로 보인다.
- 이 경우 "이 회차는 기준 외 참고 저장 이전에 검사됨"이라고 알린다. `scan.engine_version` 이나 회차 시각으로 판별할 수 있다.
- `scan.pack_version` 문자열 형식은 바꾸지 않는다. 연결표 버전을 올릴지는 별도로 결정한다.

**migration (승인 후)**

1. `drizzle/0020_unmapped_reference.sql` 에 CREATE TABLE, 인덱스, RLS ENABLE, worker GRANT·POLICY 를 넣는다. 파일 번호는 작성 시점에 다시 확인한다.
2. `schema.ts` 에 표 정의와 relations 를 추가한다.
3. 배포 순서: migration 적용 → 코드 배포.
   - 코드 쪽 insert 는 `try/catch` 로 감싸고, 실패해도 검사 자체는 성공으로 둔다. 판정 결과(finding) 저장을 막지 않기 위해서다.
   - 실패하면 경고만 남긴다 (`scrubLog`).

**rollback**

- 코드 롤백: reference insert 와 읽기만 빠지므로 기존 기능은 영향이 없다.
- 스키마 롤백: `DROP TABLE a11y.unmapped_reference;`
  - 다른 표가 이 표를 참조하지 않아 안전하다.
  - 정책은 표와 함께 지워진다.

**redaction**

- 저장 전에는 ingest 에서 finding 과 같은 함수(`redactText`·길이 제한)를 쓴다.
- 꺼낼 때는 `buildScanView` 에서 한 번 더 `redactText` 를 적용한다. 지금 finding 과 같은 이중 보호다.

**보존기간**

- 행 자체는 finding 과 같이 scan cascade 를 따른다. 계정·프로젝트 삭제 시 함께 지워진다.
- 캡처 보존(`SHOT_RETENTION_DAYS`, 기본 90일, `purgeExpiredShots`)은 파일만 지우고 행은 남긴다. 참고 행도 같은 정책을 따른다. 행 자체의 별도 보존기간은 정하지 않는다 (결정 필요).

**증거 해시**

- 현재 코드에는 발견 사항·캡처의 증거 해시가 **없다**. `ai/judge.ts` 의 crop 해시는 AI 캐시 키일 뿐 증거용이 아니다.
- 이번 반복에서는 컬럼을 만들지 않는다.
- 도입한다면 finding 과 unmapped_reference 공통으로 `evidence_hash`(redaction 후 `rule_id|selector|html|page url` 의 SHA-256)를 두는 방식을 후속 설계로 남긴다.
  - 재검사 지문(`compare.ts` fingerprint)과의 관계를 함께 정해야 한다.

## 6. 다음 구현 순서와 승인 필요 항목

| 순서 | 작업 | DB 필요 | 승인 |
|---|---|---|---|
| 1 | `buildScanView` 예전 저장분 정책 반영 (6.1.3·7.2.1·5.3.1 fail → 화면 review) + 단위 테스트 | 아니오 | 코드 변경 승인 |
| 2 | `ScanView.references` 추가 (빈 배열 기본), `referenceRows()` 모델 함수, Excel 시트·Word 부록·JSON 필드 + fixture 기반 단위 테스트 | 아니오 (fixture) | 코드 변경 승인 |
| 3 | `schema.ts` 표 정의 + `drizzle/0020_*.sql` 작성 (적용 안 함) | 파일만 | **migration 작성 승인** |
| 4 | ingest 에서 `unmappedReferencesFromState()` 저장, `loadScanView` 에서 읽기 | 예 | **migration 적용·DB 연결 승인** |
| 5 | 로컬 DB 통합 테스트 (ingest → view → 서류) | 예 | **로컬 DB 테스트 승인** |
| 6 | 실제 보고서 렌더 검증 (LibreOffice 등으로 Excel·Word 열어 확인) | 아니오 | **렌더 검증 승인** |
| 7 | 운영 DB migration 적용·배포 | 예 | **운영 반영 승인 (되돌리기 어려움)** |

결정이 필요한 사항:

1. JIS 팩에서 한국 자체 규칙(kr-*) 결과를 기준 외 참고로 저장할지, axe 결과만 저장할지.
2. 기준 외 참고 행의 별도 보존기간.
3. 회차당 저장 상한. 현재 axe 는 규칙당 위치 30개(`maxNodes`)로 제한되어 있다.
4. 증거 해시 도입 여부와 시점.
5. WCAG 2.2 팩 분리를 이 작업보다 먼저 할지.

## 7. 남은 불확실성

- 21개 규칙 목록은 axe-core 4.14.0 기준이다. axe 를 올리면 다시 감사해야 한다 (`scripts/coverage-table.ts`).
- 5.4.3 확대 예외는 `BLOCKING_NOTES` 메모로만 남아 있다. 원문의 정확한 적용 기준을 확인하기 전까지 판정 로직은 만들지 않는다.
- 이 문서의 표 이름·파일 번호·열 이름은 제안이다. 구현할 때 저장소 규칙에 맞춰 다시 확인한다.
