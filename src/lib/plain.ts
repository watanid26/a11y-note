// 결과 화면에 쓰는 "쉬운 말" 제목. 기준 항목 이름(예: 적절한 대체 텍스트 제공) 대신
// 무엇이 문제인지 바로 알 수 있는 문장으로 보여 준다. 없는 항목은 기준 항목 이름을 그대로 쓴다.
// KWCAG 는 항목 번호(5.1.1), JIS 는 WCAG 성공기준 번호(1.1.1)를 쓴다.

const KO: Record<string, string> = {
  "5.1.1": "이미지에 설명이 없거나 맞지 않아요",
  "5.2.1": "영상에 자막이 없어요",
  "5.3.1": "표의 제목 칸·설명이 부족해요",
  "5.3.2": "읽는 순서가 화면 순서와 달라요",
  "5.3.3": "모양·위치로만 안내하는 문구가 있어요",
  "5.4.1": "색으로만 구분되는 정보가 있어요",
  "5.4.2": "소리가 자동으로 재생돼요",
  "5.4.3": "글자와 배경 색 대비가 부족해요",
  "5.4.4": "콘텐츠끼리 구분이 잘 안 돼요",
  "6.1.1": "키보드로 쓸 수 없는 곳이 있어요",
  "6.1.2": "키보드 초점이 보이지 않거나 순서가 이상해요",
  "6.1.3": "누르는 영역이 너무 작아요",
  "6.1.4": "단축키가 다른 기능과 겹칠 수 있어요",
  "6.2.1": "시간 제한이 있어요",
  "6.2.2": "자동으로 바뀌는 콘텐츠를 멈출 수 없어요",
  "6.3.1": "깜빡이는 콘텐츠가 있어요",
  "6.4.1": "본문 바로가기가 없어요",
  "6.4.2": "페이지 제목이 없거나 알기 어려워요",
  "6.4.3": "링크 문구만으로 목적지를 알기 어려워요",
  "6.4.4": "고정된 참조 위치 정보가 없어요",
  "6.5.1": "여러 손가락 동작만으로 쓰는 기능이 있어요",
  "6.5.2": "누르자마자 실행돼 취소할 수 없어요",
  "6.5.3": "보이는 이름과 실제 이름이 달라요",
  "6.5.4": "기기를 흔들어야만 되는 기능이 있어요",
  "7.1.1": "페이지 언어가 지정돼 있지 않아요",
  "7.2.1": "새 창이 예고 없이 열려요",
  "7.2.2": "도움말을 찾기 어려워요",
  "7.3.1": "입력 오류를 알려 주지 않아요",
  "7.3.2": "입력칸에 이름표가 없어요",
  "7.3.3": "로그인이 기억력·계산에 의존해요",
  "7.3.4": "같은 정보를 반복해서 입력해야 해요",
  "8.1.1": "HTML 문법 오류(중복 id 등)가 있어요",
  "8.2.1": "버튼·입력칸의 이름이나 역할이 빠졌어요",
};

const WCAG: Record<string, string> = {
  "1.1.1": KO["5.1.1"],
  "1.2.2": KO["5.2.1"],
  "1.3.1": "제목·표·목록 구조가 코드에 표시되지 않았어요",
  "1.3.2": KO["5.3.2"],
  "1.4.1": KO["5.4.1"],
  "1.4.2": KO["5.4.2"],
  "1.4.3": KO["5.4.3"],
  "2.1.1": KO["6.1.1"],
  "2.1.2": "키보드로 빠져나올 수 없는 곳이 있어요",
  "2.2.1": KO["6.2.1"],
  "2.2.2": KO["6.2.2"],
  "2.4.1": KO["6.4.1"],
  "2.4.2": KO["6.4.2"],
  "2.4.4": KO["6.4.3"],
  "2.4.7": "키보드 초점이 보이지 않아요",
  "3.1.1": KO["7.1.1"],
  "3.3.2": KO["7.3.2"],
  "4.1.2": KO["8.2.1"],
  "1.2.1": "음성·영상만 있는 콘텐츠에 대체 수단이 없어요",
  "1.2.3": "영상에 음성 해설이나 대체 설명이 없어요",
  "1.2.4": "실시간 영상에 자막이 없어요",
  "1.2.5": "영상에 음성 해설이 없어요",
  "1.3.3": KO["5.3.3"],
  "1.4.4": "글자를 키우면 내용이 깨지거나 잘려요",
  "1.4.5": "글자를 이미지로 넣었어요",
  "2.3.1": KO["6.3.1"],
  "2.4.3": "키보드 이동 순서가 이상해요",
  "2.4.5": "페이지를 찾아가는 방법이 하나뿐이에요",
  "2.4.6": "제목·이름표가 내용을 설명하지 못해요",
  "3.1.2": "외국어 부분의 언어가 지정돼 있지 않아요",
  "3.2.1": "초점만 옮겨도 화면이 바뀌어요",
  "3.2.2": "입력만 해도 예고 없이 화면이 바뀌어요",
  "3.2.3": "메뉴 위치·순서가 페이지마다 달라요",
  "3.2.4": "같은 기능의 이름이 페이지마다 달라요",
  "3.3.1": KO["7.3.1"],
  "3.3.3": "입력 오류를 고치는 방법을 알려 주지 않아요",
  "3.3.4": "중요한 제출 전에 확인·취소할 수 없어요",
  "4.1.1": KO["8.1.1"],
};

export function plainTitle(itemCode: string, fallback: string): string {
  return KO[itemCode] ?? WCAG[itemCode] ?? fallback;
}

/** 목록 순서: 확실한 문제 → 사람 확인 → 판정 대기 */
export const RESULT_RANK: Record<string, number> = { fail: 0, review: 1, pending: 2, pass: 3 };

/** .jp·.co.jp 주소면 일본 기준, 그 밖에는 한국 기준을 먼저 고른다 */
export function suggestPack(url: string): "kwcag22" | "jis2016" {
  try {
    return /\.jp$/i.test(new URL(url).hostname) ? "jis2016" : "kwcag22";
  } catch {
    return "kwcag22";
  }
}

/** 결과 목록에 보일 문제: 사람이 "오류 아님"으로 정한 것은 빼고, 확실한 문제 → 사람 확인 순 */
export function issueList<G extends { result: string; humanResult: string | null; itemCode: string }>(groups: G[]): G[] {
  return groups
    .filter((g) => (g.humanResult ?? g.result) !== "pass")
    .slice()
    .sort((a, b) => (RESULT_RANK[a.humanResult ?? a.result] ?? 9) - (RESULT_RANK[b.humanResult ?? b.result] ?? 9) || a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }));
}

/**
 * 같은 기준 항목끼리 묶은 "문제 종류". 결과 목록은 종류 단위로 보여 준다.
 * 한 종류 안에 확실한 문제와 확인할 것이 섞여 있으면 더 나쁜 쪽(확실한 문제)으로 표시하고 각각 몇 곳인지 알려 준다.
 */
export function issueKinds<G extends { result: string; humanResult: string | null; itemCode: string; pages: { pageStateId: string }[] }>(groups: G[]) {
  type Kind = { key: string; itemCode: string; result: string; groups: G[]; pageCount: number; counts: Record<string, number> };
  const map = new Map<string, Kind>();
  for (const g of issueList(groups)) {
    const result = g.humanResult ?? g.result;
    const k = map.get(g.itemCode) ?? { key: g.itemCode, itemCode: g.itemCode, result, groups: [], pageCount: 0, counts: {} };
    k.groups.push(g);
    k.counts[result] = (k.counts[result] ?? 0) + 1;
    if ((RESULT_RANK[result] ?? 9) < (RESULT_RANK[k.result] ?? 9)) k.result = result;
    map.set(g.itemCode, k);
  }
  for (const k of map.values()) k.pageCount = new Set(k.groups.flatMap((g) => g.pages.map((p) => p.pageStateId))).size;
  return [...map.values()].sort((a, b) => (RESULT_RANK[a.result] ?? 9) - (RESULT_RANK[b.result] ?? 9) || a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }));
}
