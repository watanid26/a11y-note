import { afterEach, describe, expect, it } from "vitest";
import { aiModel, aiProvider, anthropicHeaders, geminiHeaders } from "./client";

const saved = {
  key: process.env.ANTHROPIC_API_KEY,
  workspace: process.env.ANTHROPIC_WORKSPACE_ID,
  provider: process.env.AI_PROVIDER,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
};

afterEach(() => {
  if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = saved.key;
  if (saved.workspace === undefined) delete process.env.ANTHROPIC_WORKSPACE_ID;
  else process.env.ANTHROPIC_WORKSPACE_ID = saved.workspace;
  if (saved.provider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = saved.provider;
  if (saved.geminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = saved.geminiKey;
  if (saved.geminiModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = saved.geminiModel;
});

describe("Anthropic 요청 헤더", () => {
  it("multi-workspace 키의 workspace ID를 모든 요청 헤더에 포함한다", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.ANTHROPIC_WORKSPACE_ID = " wrkspc_abc123 ";

    expect(anthropicHeaders()).toEqual({
      "content-type": "application/json",
      "x-api-key": "sk-ant-test",
      "anthropic-version": "2023-06-01",
      "anthropic-workspace-id": "wrkspc_abc123",
    });
  });

  it("workspace ID가 없으면 헤더를 임의로 만들지 않는다", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.ANTHROPIC_WORKSPACE_ID;

    expect(anthropicHeaders()).not.toHaveProperty("anthropic-workspace-id");
  });
});

describe("Gemini provider", () => {
  it("Gemini 선택 시 모델과 API 헤더를 사용한다", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "AIza-test";
    process.env.GEMINI_MODEL = "gemini-test";

    expect(aiProvider()).toBe("gemini");
    expect(aiModel()).toBe("gemini-test");
    expect(geminiHeaders()).toEqual({
      "content-type": "application/json",
      "x-goog-api-key": "AIza-test",
      "x-goog-api-client": "a11ynote/0.1",
    });
  });
});
