# 운영 체크리스트 (배포 전·분기마다)

## Node
- [ ] 로컬·CI·워커 Docker·Vercel 모두 Node 22 LTS (`node -v` → v22.x). Vercel 은 package.json engines `22.x` 를 따른다
- [ ] `npm ci --include=optional && npm run build:core && npm run typecheck && npm run lint && npm test` 통과

## 원격 브라우저 (BROWSER_WS_ENDPOINT 를 쓸 때만)
- [ ] 원격 브라우저 서비스가 앱·DB·워커·사내망과 다른 망인지 (같은 VPC·피어링·VPN 없음) — 망 구성도로 확인
- [ ] 원격 망의 나가는 연결이 인터넷 80·443 으로만 제한되는지, 메타데이터·사설 대역이 망 수준에서 막혔는지
- [ ] `REMOTE_ISOLATION_PROBES` 에 우리 DB·앱의 사설 주소를 적었는지
- [ ] 스테이징에서 원격 연결 시 격리 검사가 통과하는지 (실패하면 서버 검사가 멈추는 것이 정상)
- [ ] 위 항목 확인 후에만 `BROWSER_REMOTE_ENABLED=1`
- [ ] 로컬에서 `npx tsx scripts/test-remote-isolation.ts` 통과 (테스트 사이트 실행 상태)

## 로컬 워커 (원격 브라우저를 쓰지 않을 때)
- [ ] `deploy/run-worker.sh` 의 배포 게이트(내부망·메타데이터·UDP 접속 시도) 통과
- [ ] `npx tsx scripts/test-ssrf.ts`, `scripts/test-proxy-size.ts` 통과

## 검사 범위·주소
- [ ] 여러 도메인을 쓰는 사이트는 `A11Y_SCOPE_EXTRA_ORIGINS` 에 origin 을 명시했는지 (하위 도메인 자동 허용 없음)
- [ ] 화면 구분에 꼭 필요한 쿼리만 `A11Y_URL_QUERY_ALLOW` 에 키=값규칙으로 추가했는지 (값 규칙은 짧은 영숫자로)
- [ ] 서류 샘플을 만들어 쿼리·이메일·토큰이 없는지 확인 (`src/lib/report/zero-secret.test.ts` 가 자동으로도 확인)
