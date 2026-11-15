// "국가 팩": 기준 항목 목록 + 규칙 연결표 + 서류 양식 이름.
// 점검 엔진은 하나(WCAG 기준)이고, 나라마다 바뀌는 부분만 팩으로 갈아 끼운다.

import type { Applicability } from "../types";

export type Method = "auto" | "ai" | "manual";

export interface PackItem {
  code: string;
  principle: string;
  title: string;
  method: Method;
  /** 같은 뜻의 WCAG 성공기준 */
  wcag: string[];
  /** 이 요소가 페이지에 없으면 "해당 없음" */
  applies?: keyof Applicability;
  how: string;
  fix: string;
  /** 자동 결과가 없어도 "적합"으로 볼 수 없는 항목 (사람 확인 필요) */
  needsHuman?: boolean;
  /** JIS 처럼 적합 레벨을 표기하는 기준 */
  level?: "A" | "AA";
}

export interface Pack {
  id: "kwcag22" | "jis2016";
  name: string;
  country: "KR" | "JP";
  locale: "ko" | "ja";
  /** 보고서에 남기는 기준·연결표 버전 (연결표를 바꾸면 올린다, P0-10) */
  version: string;
  items: PackItem[];
  ruleMap: Record<string, string>;
}
