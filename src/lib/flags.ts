// 기능 플래그. 위험하거나 아직 검증되지 않은 기능은 기본으로 꺼 두고, 환경변수로만 켠다.
// 값 "on" | "1" | "true" 일 때만 켜짐. 그 밖의 값·미설정은 모두 꺼짐.
//
// | 플래그              | 기본 | 뜻                                                        |
// | FLOW_AUTOTRY        | 꺼짐 | 서버 워커가 흐름(검색·빈 칸 제출)을 직접 조작하는 기능 전체 |
// | FLOW_SEARCH         | 꺼짐 | 검색 실행 (FLOW_AUTOTRY 도 켜져 있어야 함, GET 검색 폼만)    |
// | FLOW_EMPTY_SUBMIT   | 꺼짐 | 빈 칸 제출 후 오류 안내 확인 (FLOW_AUTOTRY 도 켜져 있어야 함) |
// | AI_FLOWS            | 꺼짐 | AI 로 흐름 제안 목록 다듬기                                 |
//
// 흐름 "찾기"(메뉴를 보고 제안 목록 만들기)는 페이지를 조작하지 않으므로 플래그와 상관없이 동작한다.

export interface Flags {
  flowAutoTry: boolean;
  flowSearch: boolean;
  flowEmptySubmit: boolean;
  aiFlows: boolean;
}

function on(env: Record<string, string | undefined>, key: string): boolean {
  const v = (env[key] ?? "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

export function readFlags(env: Record<string, string | undefined> = process.env): Flags {
  const autoTry = on(env, "FLOW_AUTOTRY");
  return {
    flowAutoTry: autoTry,
    flowSearch: autoTry && on(env, "FLOW_SEARCH"),
    flowEmptySubmit: autoTry && on(env, "FLOW_EMPTY_SUBMIT"),
    aiFlows: on(env, "AI_FLOWS"),
  };
}

export const flags = (): Flags => readFlags();
