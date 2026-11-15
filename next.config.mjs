/** @type {import('next').NextConfig} */
const nextConfig = {
  // 운영 빌드 시험(scripts/test-prod-build.sh)이 개발 서버의 .next 를 덮어쓰지 않게
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    instrumentationHook: true,
    serverActions: { bodySizeLimit: "20mb" },
    serverComponentsExternalPackages: ["sharp", "exceljs", "docx", "playwright-core"],
    // 검사 코어(브라우저에 넣는 스크립트)를 서버 함수에서 읽을 수 있게 포함
    outputFileTracingIncludes: { "/api/**": ["./public/a11y-core.js"] },
  },
};
export default nextConfig;
