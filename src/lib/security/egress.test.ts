import { describe, expect, it } from "vitest";
import { checkUrl, isBlockedAddress } from "./egress";

const prod = { NODE_ENV: "production" };

describe("SSRF 1차 점검 — 차단해야 하는 주소 (P0-1)", () => {
  const blocked = [
    "http://127.0.0.1/",
    "http://127.1/", // 축약 표기
    "http://0x7f000001/", // 16진수
    "http://2130706433/", // 10진수
    "http://017700000001/", // 8진수
    "http://0.0.0.0/",
    "http://[::]/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/", // IPv4 매핑
    "http://[::ffff:7f00:1]/",
    "http://169.254.169.254/latest/meta-data/", // 클라우드 메타데이터
    "http://[::ffff:169.254.169.254]/",
    "http://[64:ff9b::a9fe:a9fe]/", // NAT64 로 감싼 메타데이터
    "http://[2002:a9fe:a9fe::]/", // 6to4 로 감싼 메타데이터
    "http://[fe80::1]/", // IPv6 링크로컬
    "http://[fc00::1]/", // IPv6 사설(ULA)
    "http://[fd12:3456::1]/",
    "http://[ff02::1]/", // 멀티캐스트
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.0.1/",
    "http://100.64.0.1/", // 통신사 NAT
    "http://198.18.0.1/",
    "http://224.0.0.1/",
    "http://255.255.255.255/",
    "http://localhost/",
    "http://LOCALHOST./",
    "http://app.localhost/",
    "http://printer.local/",
    "http://db.internal/",
    "http://metadata.google.internal/",
    "http://intranet/", // 점 없는 이름
    "http://user:pw@example.com/", // 계정 정보 포함
    "http://example.com:8080/", // 기본 포트 아님
    "http://example.com:22/",
    "ftp://example.com/",
    "file:///etc/passwd",
    "gopher://example.com/",
    "javascript:alert(1)",
    "not a url",
  ];
  for (const u of blocked) {
    it(`차단: ${u}`, () => {
      expect(() => checkUrl(u, prod)).toThrow();
    });
  }
});

describe("SSRF 1차 점검 — 허용해야 하는 주소", () => {
  for (const u of ["https://www.example.go.kr/", "http://example.go.kr/index.do", "https://example.com:443/a?b=1", "http://8.8.8.8/", "http://[2606:4700:4700::1111]/"]) {
    it(`허용: ${u}`, () => {
      expect(() => checkUrl(u, prod)).not.toThrow();
    });
  }
});

describe("개발용 허용 목록", () => {
  it("개발에서는 지정한 host:port 만 허용", () => {
    const env = { NODE_ENV: "development", EGRESS_ALLOW_HOSTS: "localhost:4400" };
    expect(() => checkUrl("http://localhost:4400/", env)).not.toThrow();
    expect(() => checkUrl("http://localhost:4401/", env)).toThrow();
    expect(() => checkUrl("http://127.0.0.1:4400/", env)).toThrow();
  });
  it("운영에서는 허용 목록을 무시", () => {
    expect(() => checkUrl("http://localhost:4400/", { NODE_ENV: "production", EGRESS_ALLOW_HOSTS: "localhost:4400" })).toThrow();
  });
});

describe("IP 판별 (DNS 조회 결과 점검용)", () => {
  it("공인 주소만 통과", () => {
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
    expect(isBlockedAddress("2606:4700::1111")).toBe(false);
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "::1", "::ffff:10.0.0.1", "fe80::1", "fd00::1", "0.0.0.0", "100.100.100.100", "2001:db8::1", "2001::1"]) expect(isBlockedAddress(ip)).toBe(true);
  });
  it("IPv6 zone ID 가 붙어도 정규화 후 차단", () => {
    expect(isBlockedAddress("fe80::1%eth0")).toBe(true);
    expect(isBlockedAddress("[::1]")).toBe(true);
  });
  it("해석할 수 없는 값은 차단", () => {
    expect(isBlockedAddress("example.com")).toBe(true);
    expect(isBlockedAddress("1.2.3")).toBe(true);
  });
});

describe("IPv6 안에 감싼 IPv4 (GPT 리뷰: 실제 허용·차단 동작)", () => {
  it("NAT64(64:ff9b::/96): 안의 IPv4 가 공인이면 허용, 내부면 차단", () => {
    expect(isBlockedAddress("64:ff9b::808:808")).toBe(false); // 8.8.8.8
    expect(isBlockedAddress("64:ff9b::a00:1")).toBe(true); // 10.0.0.1
    expect(isBlockedAddress("64:ff9b::a9fe:a9fe")).toBe(true); // 169.254.169.254
  });
  it("6to4(2002::/16): 안의 IPv4 기준", () => {
    expect(isBlockedAddress("2002:808:808::1")).toBe(false);
    expect(isBlockedAddress("2002:7f00:1::1")).toBe(true); // 127.0.0.1
    expect(isBlockedAddress("2002:c0a8:101::1")).toBe(true); // 192.168.1.1
  });
  it("Teredo(2001::/32)는 서버가 IPv4 를 숨길 수 있어 항상 차단", () => {
    expect(isBlockedAddress("2001:0:4136:e378:8000:63bf:3fff:fdd2")).toBe(true);
  });
  it("IPv4 매핑·호환 표기 모두", () => {
    expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
    expect(isBlockedAddress("::ffff:192.168.0.1")).toBe(true);
    expect(isBlockedAddress("::192.168.0.1")).toBe(true);
  });
});

describe("IANA 특수 목적 대역 전체 (전역 도달 불가)", () => {
  const iana = ["0.0.0.0", "10.0.0.0", "100.64.0.0", "127.0.0.0", "169.254.0.0", "172.16.0.0", "192.0.0.0", "192.0.0.8", "192.0.0.170", "192.0.2.0", "192.88.99.2", "192.168.0.0", "198.18.0.0", "198.51.100.0", "203.0.113.0", "240.0.0.0", "255.255.255.255"];
  for (const ip of iana) it(`차단: ${ip}`, () => expect(isBlockedAddress(ip)).toBe(true));
  it("대역 끝 주소도 차단, 바로 바깥은 허용", () => {
    expect(isBlockedAddress("172.31.255.255")).toBe(true);
    expect(isBlockedAddress("172.32.0.0")).toBe(false);
    expect(isBlockedAddress("100.127.255.255")).toBe(true);
    expect(isBlockedAddress("100.128.0.0")).toBe(false);
    expect(isBlockedAddress("198.19.255.255")).toBe(true);
    expect(isBlockedAddress("198.20.0.0")).toBe(false);
  });
});
