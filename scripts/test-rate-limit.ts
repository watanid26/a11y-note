// DB 방식 속도 제한: 동시 요청 50건, 한도 10 → 정확히 10건 허용 (여러 인스턴스 흉내: 연결 2개로 나눠 호출)
import "dotenv/config";
import { takeRateLimitDb } from "../src/lib/security/rate-limit";
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail));
  if (!ok) process.exitCode = 1;
}
(async () => {
  const key = `test:${Date.now()}:${Math.random()}`;
  const res = await Promise.all(Array.from({ length: 50 }, () => takeRateLimitDb(key, 10, 60)));
  check("동시 50건 중 정확히 10건 허용", res.filter(Boolean).length === 10, res.filter(Boolean).length);
  const other = await takeRateLimitDb(`${key}:other`, 10, 60);
  check("다른 키는 따로 셈", other === true);
  process.exit();
})();
