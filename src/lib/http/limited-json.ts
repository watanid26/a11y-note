// 요청 본문을 크기 상한까지만 읽고, JSON 중첩 깊이·배열 길이를 제한한다 (P0-4, GPT 리뷰: 요청 본문·JSON 깊이).
// Next.js 라우트의 req.json() 은 크기 제한이 없어 큰 본문 한 번으로 메모리를 고갈시킬 수 있다.

export class BodyTooLarge extends Error {}
export class BodyInvalid extends Error {}

export async function readLimited(req: Request, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLarge();
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** 중첩 깊이·배열 길이 점검 (재귀 대신 스택으로, 깊은 입력에서도 스택이 넘치지 않게) */
export function checkShape(value: unknown, opts: { maxDepth: number; maxArray: number; maxKeys: number }): void {
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length) {
    const [v, d] = stack.pop()!;
    if (v === null || typeof v !== "object") continue;
    if (d > opts.maxDepth) throw new BodyInvalid(`중첩이 너무 깊습니다 (${opts.maxDepth}단계 초과)`);
    if (Array.isArray(v)) {
      if (v.length > opts.maxArray) throw new BodyInvalid(`배열이 너무 깁니다 (${opts.maxArray}개 초과)`);
      for (const x of v) stack.push([x, d + 1]);
    } else {
      const keys = Object.keys(v);
      if (keys.length > opts.maxKeys) throw new BodyInvalid(`항목이 너무 많습니다 (${opts.maxKeys}개 초과)`);
      for (const k of keys) stack.push([(v as Record<string, unknown>)[k], d + 1]);
    }
  }
}

export async function readJsonLimited(req: Request, maxBytes: number, shape = { maxDepth: 20, maxArray: 2000, maxKeys: 200 }): Promise<unknown> {
  const buf = await readLimited(req, maxBytes);
  let data: unknown;
  try {
    data = JSON.parse(buf.toString("utf8"));
  } catch {
    throw new BodyInvalid("JSON 형식이 아닙니다");
  }
  checkShape(data, shape);
  return data;
}
