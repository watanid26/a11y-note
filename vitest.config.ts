import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // 화면 컴포넌트를 서버 렌더링해 수치 표기를 확인하는 테스트가 있어 JSX 자동 변환을 켠다
  esbuild: { jsx: "automatic" },
  test: { include: ["src/**/*.test.ts"] },
});
