# 접근성 점검노트 (a11ynote)

사이트 주소만 넣으면 **웹 접근성 자체진단 점검표와 보고서 초안**을 자동으로 만드는 웹 앱.
한국 **KWCAG 2.2**(33개 항목)와 일본 **JIS X 8341-3:2016 AA**(38개 달성기준)를 지원한다.
로그인·신청·예약처럼 여러 화면을 거치는 흐름과 내부망 스테이징은 **크롬 확장**으로 한 번만 녹화한다.

> 자동 검사는 기준의 일부만 확인한다. 이 도구는 자체진단을 돕는 도구이며 인증마크 발급이나 법적 준수를 보장하지 않는다. 화면·서류 어디에도 "준수 보장"이라고 쓰지 않는다.

## 구조

```
[웹 앱 Next.js]  프로젝트·회차·실시간 결과·사람 확인·서류 다운로드     ← Vercel
      │  DB(Postgres, a11y 스키마) · 캡처(Supabase Storage)
[검사 워커]      공개 페이지 수집 → 대표 페이지 선정 → 검사·Tab 순회·캡처 → 흐름 자동 시도 → AI 판정  ← 컨테이너 1개
[크롬 확장]      로그인·내부망 화면 검사, 흐름 녹화(화면 바뀔 때마다 자동 검사), 오프라인 파일 저장
```

검사 엔진(`src/core/page`)은 **하나의 번들**(`a11y-core.js`, axe-core 포함)로 만들어 워커와 확장이 똑같이 주입한다. 어디서 검사해도 결과가 같다.

| 층 | 하는 일 | 위치 |
|---|---|---|
| 브라우저 조작 | 페이지 열기, Tab 키, 캡처(입력칸 가림) | `worker/browser.ts`, `extension/background.js` |
| 규칙 검사 | axe-core + 한국 실무 규칙(본문 바로가기, 새 창 안내, 캡션, 크기 등) | `src/core/page/*` |
| 항목 연결 | 규칙 → KWCAG/JIS 항목 ("국가 팩") | `src/core/packs/*` |
| 판정 | 발견 사항·키보드 분석·항목 결과(적합/부적합/검토 필요/해당 없음) | `src/core/judge.ts` |
| AI 판정 | 대체텍스트·링크·제목·표·슬라이드·캡차 초안 판정 + 확신도. 낮으면 사람에게 | `src/lib/ai/judge.ts` |
| 흐름 | 메뉴로 흐름 찾기 + AI 길 안내, 검색·빈 칸 제출은 자동 시도 | `src/lib/flows.ts`, `src/lib/ai/flows.ts`, `worker/site-scan.ts` |
| 서류 | 점검표 엑셀(한국형/일본 達成基準チェックリスト), 보고서 Word(캡처 포함), 수정 요청서 MD | `src/lib/report/*` |

### 안전장치
- 워커는 검사 내내 **GET 이외 요청과 탈퇴·삭제·결제 주소를 차단**한다. 빈 칸 제출 시도는 페이지 이동도 막아 실제 접수가 일어나지 않는다.
- 확장 녹화 중 **결제·확정·탈퇴 등 위험 버튼은 클릭을 막는다**(흐름별 "누르지 마세요" 문구도 반영).
- 비밀번호·입력값은 서버로 보내지 않는다. 캡처 전에 입력칸 글자를 흐리게 가리고, 녹화 단계에는 값 대신 자리표시만 저장한다.
- AI 키는 서버에만. 하루 예산(`AI_DAILY_BUDGET_USD`)을 넘으면 규칙 기반 판정으로 넘어간다.
- 확장은 쿠키 대신 프로젝트 연결 키로만 결과를 올릴 수 있다(결과 열람·서류는 로그인 필요).

## 로컬 실행

**Node 22 LTS 만 지원한다** (`.nvmrc`=22, `package.json` engines `22.x`, `.npmrc` engine-strict, CI·워커 Docker 같은 기준).
Node 18·20 지원은 중단했다 — 설치 단계에서 바로 멈춘다 (`EBADENGINE` 또는 `scripts/check-node.cjs` 안내). Vercel 은 engines 값으로 Node 22 를 쓴다.

```bash
nvm use                          # Node 22
npm ci --include=optional
cp .env.example .env.local      # DATABASE_URL 만 맞추면 됨
npx drizzle-kit migrate          # a11y 스키마 생성
npm run build:core               # 검사 번들 → public/, extension/
npm run dev                      # http://localhost:3200  (개발용 로그인)
npm run worker                   # 다른 터미널에서 검사 워커
npm run fixture                  # (선택) 문제를 일부러 넣은 테스트 사이트 http://localhost:4400
```

크롬 확장: `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드" → `extension` 폴더.
사이드 패널 설정에 서버 주소와 프로젝트 화면의 "프로젝트 연결 키"를 넣는다.

검사: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.
브라우저·DB 가 필요한 통합 검사 (Postgres + `npm run fixture` 실행 상태): `scripts/test-browser-run.ts`, `test-scope.ts`, `test-reverse-trap.ts`, `test-proxy-size.ts`, `test-judgement-labels.ts`.
원격 브라우저 격리 검사는 브라우저 실행 파일이 필요하다 (CHROMIUM_PATH → macOS Chrome·Chromium → Linux Chromium 순으로 찾고, 없으면 안내 후 종료 코드 2):
```bash
npm run fixture   # 다른 터미널
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx scripts/test-remote-isolation.ts   # macOS
CHROMIUM_PATH=/usr/bin/chromium npx tsx scripts/test-remote-isolation.ts                                                  # Linux
```

## 판정 정확성 (P0-8)

- 연결표 불변식 (`src/core/packs/packs.test.ts`): 연결표의 모든 규칙이 실제로 실행되는 규칙인지(폐지·AAA·오타 없음), 자동·의미 판단 항목마다 실행되는 규칙이 1개 이상인지, 사람 확인·수동 항목이 자동으로 "문제 미발견"이 되지 않는지.
- 정답 화면 세트 (`fixtures/accuracy/cases.ts`, `fixtures/expected.kwcag22.json`): 자동 판정 18개 사례의 문제 있음/없음 쌍. `npx tsx scripts/test-accuracy.ts` 가 KWCAG·JIS 둘 다로 판정해 거짓 문제 미발견·거짓 부적합이 하나라도 있으면 실패하고 `docs/accuracy-report.md` 를 남긴다. **axe-core·Playwright·자체 규칙을 바꿀 때 반드시 실행.**
- 이 세트는 자체 제작이다. 실무자 검토와 실제 사이트 대조 전에는 "자체 정답 세트"로만 쓴다.
- 보고서 첫 장에 기준·연결표 버전, 검사 엔진 버전(axe-core 포함), 검사 범위·선정 방식·검사하지 않은 범위·판정 구분이 자동으로 들어간다 (P0-10, 회차에 `pack_version`·`engine_version` 저장).

## 개인정보 (P0-9)

- 캡처 보관: 업로드 시각(`page_state.created_at`) 기준 90일(`SHOT_RETENTION_DAYS`). 워커가 하루 1회 `/api/internal/cleanup` 호출 → 파일 삭제·`screenshot_deleted_at` 기록. 실패하면 DB 를 바꾸지 않으므로 다음 실행(1시간 뒤)에 다시 시도. 잘라낸 증거 이미지·보고서 이미지는 저장하지 않고 요청 때마다 원본에서 만든다.
- 화면·프로젝트 삭제: 저장소 파일을 먼저 지우고 DB 를 지운다. 중간에 실패해도 다시 누르면 이어서 지워진다.
- 외부 AI: 프로젝트별 설정(기본 꺼짐), 서버에서 확인. 요소 주변 잘라낸 이미지와 대체 텍스트·링크 글자만, 주소 쿼리·세션 ID 제거.
- 수집하지 않음: 쿠키·세션 토큰·페이지 저장소·입력값·숨은 입력값 (`src/core/no-collect.test.ts`, `scripts/test-no-token-leak.ts`).
- 확장 권한 목적: `docs/extension-permissions.md`

## 알려진 한계

- 점검자 판정 변경 이력: 현재는 마지막 결정자·시각·메모만 남는다. 이전 값까지 남기는 감사 이력은 P1-3 에서 추가한다.
- 운영 VM 네트워크 격리: 이 PC 에서 owner 방식으로 검증했다. 운영에서는 워커가 시작할 때 스스로 격리를 점검해 실패하면 작업을 시작하지 않는다(`worker/isolation-check.ts`, 종료 코드 78). 배포 스크립트도 실행 직후 한 번 더 확인한다.
- 속도 제한: 확장 API 는 DB 방식(인스턴스 공통). 로그인 화면 제한은 Edge 미들웨어라 인스턴스별 메모리 방식이며, 로그인 자체는 Supabase Auth 제한을 함께 받는다.
- 삭제 결과 기록: 지금은 서버 로그에 정리 개수만 남는다. 감사 이력 표는 P1-3.

## 기능 플래그 (`src/lib/flags.ts`)

위험하거나 아직 검증되지 않은 기능은 **기본으로 꺼져 있습니다.** 값이 `on`, `1`, `true` 일 때만 켜집니다.

| 환경변수 | 기본 | 내용 |
|---|---|---|
| `FLOW_AUTOTRY` | 꺼짐 | 서버 워커가 흐름을 직접 조작하는 기능 전체 스위치 |
| `FLOW_SEARCH` | 꺼짐 | 검색 실행. `FLOW_AUTOTRY` 도 켜야 하며, 같은 사이트로 보내는 GET 검색 폼에서만 동작 |
| `FLOW_EMPTY_SUBMIT` | 꺼짐 | 신청·문의·가입 폼을 빈 칸으로 제출해 오류 안내 확인 (서버 전송은 차단). `FLOW_AUTOTRY` 도 켜야 함 |
| `AI_FLOWS` | 꺼짐 | AI 로 흐름 제안 목록 다듬기 |

흐름 **찾기**(메뉴를 보고 "녹화할 흐름" 목록 만들기)는 페이지를 조작하지 않으므로 항상 동작합니다. 꺼진 흐름은 확장 프로그램으로 사람이 녹화합니다.

검증: `npm run fixture` 를 띄운 뒤 `npx tsx scripts/test-flow-flags.ts`

## 검사 워커 보안 (SSRF 방어·격리)

- **앱 계층** (`worker/egress-proxy.ts`, `src/lib/security/egress.ts`): Chromium 의 모든 요청과 크롤러 요청이 워커 안 관문 프록시를 거친다. 접속마다 DNS 를 직접 조회해 사설·루프백·링크로컬(메타데이터)·예약 대역이면 거부하고, 검사한 IP 로만 접속한다 (재바인딩 차단). 리다이렉트는 단계마다 재검사, 80·443 포트만. 프록시가 죽으면 Chromium 은 아무 데도 접속하지 못한다 (fail-closed).
- **네트워크 계층** (`deploy/worker-firewall.sh`): 워커 컨테이너의 나가는 연결 중 내부 대역·UDP·기타 포트를 VM 방화벽에서 차단. 프록시를 우회한 직접 접속도 막힌다.
- **실행 환경** (`deploy/run-worker.sh`, `Dockerfile.worker`): 비루트, 권한 제거, 읽기 전용 파일 시스템, CPU 2·메모리 2GB·프로세스 512 한도.
- **DB 권한** (`drizzle/0002_worker_role.sql`, `0003_worker_policies.sql`): 워커는 `a11y_worker` 역할로 필요한 표·작업만. 프로젝트 수정·삭제, 사람 결정 쓰기, 표 생성·삭제 불가. 행 보안 우회 권한 없음.
- **저장소 키 없음**: 워커는 Supabase 서버 키를 갖지 않는다. 캡처는 웹 앱의 `/api/internal/shots`(공유 비밀 `WORKER_SHARED_SECRET`, 진행 중인 서버 회차·실제 이미지·20MB 만)로 저장·조회한다.
- **응답 크기**: 프록시가 연결당 30MB(`PROXY_CONN_BYTES`), 회차당 500MB(`PROXY_SCAN_BYTES`)를 넘으면 끊는다. 프록시는 브라우저(회차)마다 따로 띄워 동시에 도는 회차끼리 한도를 나눠 쓰지 않는다.
- **검사 범위**: 주 문서가 다른 사이트(외부 로그인·제3자)로 넘어가면 그 화면은 "검사 범위 밖"으로 건너뛴다 (`assertInScope`). www 유무·하위 도메인은 같은 범위.
- **원격 브라우저(`BROWSER_WS_ENDPOINT`)**: 운영에서는 기본으로 꺼져 있다. 켜려면 `BROWSER_REMOTE_ENABLED=1` 이 필요하고, 연결할 때마다 원격 브라우저로 메타데이터·루프백·사설 대역(IPv4·IPv6)과 `REMOTE_ISOLATION_PROBES` 에 적은 우리 내부 주소에 실제로 접속해 본다. 하나라도 HTTP 응답이 오면 그 브라우저를 쓰지 않는다 (fail-closed, 10분마다 다시 검사). 원격 모드에서도 요청마다 우리 쪽 DNS 조회로 내부 주소를 막지만, 원격 쪽 DNS 가 다른 답을 내는 재바인딩은 우리 코드만으로 완전히 막을 수 없으므로 **아래 "원격 브라우저 운영 조건"의 망 분리가 전제다.** 체크리스트: `deploy/CHECKLIST.md`.
- **검사 범위(origin 허용 목록)**: 시작 주소의 origin, 같은 호스트의 https, www 붙이거나 뗀 것만 범위다. 다른 하위 도메인은 `A11Y_SCOPE_EXTRA_ORIGINS` 에 origin 으로 적어야 한다.
- **주소 비식별화** (`src/lib/security/url.ts`): 저장·보고서·AI·로그로 나가는 주소는 기본 origin + 경로. 쿼리는 키·값 허용 목록(menuId·page 등, `A11Y_URL_QUERY_ALLOW` 로 추가)에 맞는 것만. HTML·문맥·메시지·로그 속 주소와 이메일·전화·JWT·긴 토큰도 가린다. 모양 탐지는 보조 수단.

### 원격 브라우저 운영 조건 (배포 망 정책)
1. 원격 브라우저 서비스는 우리 앱·DB·워커·사내망과 **다른 망**에 있어야 한다. 같은 VPC·피어링·사설 링크·VPN 연결 금지.
2. 원격 브라우저 망의 나가는 연결은 인터넷(80·443)만 허용하고, 메타데이터(169.254.169.254, fd00:ec2::254)·사설 대역·루프백 이외 서비스로의 접근을 망 수준에서 막는다.
3. 원격 브라우저 서비스 계정 키(`BROWSER_WS_ENDPOINT` 의 토큰)는 비밀 값으로만 저장하고, 접속 기록을 남긴다.
4. `REMOTE_ISOLATION_PROBES` 에 우리 DB·앱의 실제 사설 주소를 적어 격리 검사가 그 주소까지 확인하게 한다.
5. 위 조건을 확인하기 전에는 `BROWSER_REMOTE_ENABLED` 를 켜지 않는다 (서버 검사 대신 크롬 확장 검사를 쓴다).
- **배포 게이트**: `deploy/run-worker.sh` 는 실행 직후 컨테이너 안에서 내부망·메타데이터·VM 자신·UDP 접속을 시도해 하나라도 되면 워커를 멈춘다.
- **실행 한도**: 회차 20분(`SCAN_LIMIT_MS`), 화면 60초(`PAGE_LIMIT_MS`). 초과 시 탭을 닫아 실제로 끊는다.

검증: `npx tsx scripts/test-ssrf.ts`, `sudo ./scripts/test-network-isolation.sh`, `MODE=page|scan npx tsx scripts/test-limits.ts`, `WORKER_DATABASE_URL=... npx tsx scripts/test-worker-role.ts`
운영 VM 적용 후: `docker exec a11ynote-worker node scripts/net-probe.mjs 169.254.169.254 80` 결과가 모두 error 여야 한다.

## 배포

1. Supabase: 같은 프로젝트 DB 에 `a11y` 스키마 (`DIRECT_URL=… npx drizzle-kit migrate`), Storage private 버킷 `a11y-shots`, Auth Redirect URL 에 `https://<도메인>/**` 추가
2. Vercel: 웹 앱 배포 + 환경변수 (`.env.example`)
3. 워커: `Dockerfile.worker` 로 컨테이너 1개 (같은 환경변수, `ANTHROPIC_API_KEY` 포함)
4. 확장: 크롬 웹스토어 등록 전까지는 압축해제 로드로 배포

## 다음 단계
- AI 에이전트가 흐름을 직접 조종 (지금은 검색·빈 칸 제출만 자동, 나머지는 녹화)
- 녹화한 흐름 재생으로 다음 회차 자동 재검사
- 일본어 화면 문구(흐름 이름·자체 규칙 문구), 모바일 앱 지침

## 사용 한도 (P1-2) — 비용·남용 방지

외부 AI·브라우저 실행 비용이 무한정 늘지 않도록 서버 검사에 한도를 둔다.

- 단위: **이번 달(KST)에 서버 검사로 검사를 마친 서로 다른 화면 수**. 회차 수·동시 검사는 보조 제한.
- 같은 달에 같은 화면(쿼리·조각 제외 주소)을 다시 검사하면 다시 세지 않는다. 오류·시간 초과·차단으로 검사하지 못한 화면도 세지 않는다.
- 검사 시작 때 프로젝트 행을 잠그고 상한을 예약(`scan_usage`)하고, 끝나면 실제로 검사한 새 화면만 집계(`usage_page`)한다. 집계는 한 번만 반영되고, 실패·중단된 회차의 예약은 풀린다.
- 워커는 예약이 없는 회차를 검사하지 않는다. 한도에 도달하면 이미 센 화면만 다시 검사하는 회차로 열린다.
- 기본 한도는 계정 단위로도 묶는다 (`owner_usage` 원장, 프로젝트 3개까지, 계정별 잠금으로 동시 생성도 제한).
- 한도 수치는 `src/lib/usage-limits.ts` 의 `PLANS` 에 있다. 프로젝트별 한도 변경: `npx tsx scripts/set-project-limit.ts <프로젝트 id> extended 90 "메모"`
- 테스트: `src/lib/usage-limits.test.ts`, `scripts/test-usage.ts` (테스트 사이트·웹 서버 필요).
