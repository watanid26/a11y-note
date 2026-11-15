import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Pretendard Variable"', "Pretendard", "-apple-system", "BlinkMacSystemFont", '"Apple SD Gothic Neo"', '"Noto Sans KR"', "sans-serif"],
        serif: ['"Noto Serif KR"', '"Nanum Myeongjo"', '"AppleMyungjo"', "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", '"SFMono-Regular"', "Menlo", "monospace"],
      },
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        line: v("line"),
        "line-strong": v("line-strong"),
        ink: v("ink"),
        muted: v("muted"),
        brand: v("brand"),
        "brand-ink": v("brand-ink"),
        "brand-soft": v("brand-soft"),
        "on-brand": v("on-brand"),
        "on-bad": v("on-bad"),
        ok: v("ok"),
        "ok-soft": v("ok-soft"),
        warn: v("warn"),
        "warn-soft": v("warn-soft"),
        bad: v("bad"),
        "bad-soft": v("bad-soft"),
      },
      // A안 공문서: 모서리는 2px. 원형(full)은 점·진행 막대·아바타에만.
      borderRadius: { sm: "2px", DEFAULT: "2px", md: "2px", lg: "2px", xl: "2px", "2xl": "2px", "3xl": "2px" },
    },
  },
  plugins: [],
};
export default config;
