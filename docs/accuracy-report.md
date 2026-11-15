# 정확성 회귀 결과 (정답 화면 세트)

실행: 2026-10-28T12:54:10.703Z · 정답 세트 cases-r3 · 엔진 a11ynote-core 0.3.1 / axe-core 4.14.0

## 요약

- 문제 탐지율 (문제 있는 화면에서 해당 항목을 부적합/검토 필요로 올린 비율): 34/34 = 100.0%
- 거짓 문제 미발견: 0건 (95% 상한 약 8.8%)
- 문제 없는 화면에서 부적합을 내지 않은 비율: 34/34 = 100.0%
- 거짓 부적합: 0건 (95% 상한 약 8.8%)

**해석 주의**: 표본이 작고(19개 사례 × 기준 2개) 자체 제작이라, 0건이 실제 사이트에서의 정확도를 보장하지 않는다. 항목당 사례가 1~2개뿐이다.

## 사례별

| 사례 | KWCAG | JIS | 내용 | KWCAG 판정 | JIS 판정 |
|---|---|---|---|---|---|
| img-alt | 5.1.1 | 1.1.1 | 이미지 대체 텍스트 없음 | ✅ bad=fail / ✅ good=review | ✅ bad=fail / ✅ good=review |
| table-headers | 5.3.1 | 1.3.1 | 표의 headers 가 없는 제목 셀을 가리킴 | ✅ bad=fail / ✅ good=review | ✅ bad=fail / ✅ good=review |
| table-caption | 5.3.1 | — | 데이터 표 캡션 없음 (한국 실무 기준, 사람 확인) | ✅ bad=review / ✅ good=review | — |
| contrast | 5.4.3 | 1.4.3 | 글자 명도 대비 부족 | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| click-only | 6.1.1 | 2.1.1 | 마우스로만 실행되는 요소 | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| keyboard-trap | 6.1.1 | 2.1.2 | Tab 키로 빠져나갈 수 없는 요소 | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| focus-indicator | 6.1.2 | 2.4.7 | 초점 표시 없앰 | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| target-size | 6.1.3 | — | 누를 수 있는 컨트롤이 너무 작음 (권고 기준, 사람 확인) | ✅ bad=review / ✅ good=none | — |
| target-size-hidden | 6.1.3 | — | 숨긴 입력·건너뛰기 링크를 작은 대상으로 세지 않음 | ✅ bad=review / ✅ good=none | — |
| meta-refresh | 6.2.1 | 2.2.1 | 시간 제한 자동 새로고침 | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| skip-link | 6.4.1 | 2.4.1 | 본문 바로가기 없음 | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| page-title | 6.4.2 | 2.4.2 | 페이지 제목 없음 | ✅ bad=fail / ✅ good=review | ✅ bad=fail / ✅ good=review |
| link-name | 6.4.3 | 2.4.4 | 이름 없는 링크 (빈 alt 이미지 링크) | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| lang | 7.1.1 | 3.1.1 | 기본 언어 지정 없음 | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| new-window | 7.2.1 | — | 새 창 안내 없음 (한국 실무, 사람 확인) | ✅ bad=review / ✅ good=none | — |
| label | 7.3.2 | 3.3.2 | 입력칸 레이블 없음 | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| duplicate-id | 8.1.1 | 4.1.1 | 중복 id | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| button-name | 8.2.1 | 4.1.2 | 이름 없는 버튼 | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |
| autoplay | 5.4.2 | 1.4.2 | 소리 있는 미디어 자동 재생 | ✅ bad=fail / ✅ good=none | ✅ bad=fail / ✅ good=none |

## 항목별 (탐지 / 문제 없는 화면 통과)

| 항목 | 탐지 | 정상 통과 |
|---|---|---|
| JIS 1.1.1 | 1/1 | 1/1 |
| JIS 1.3.1 | 1/1 | 1/1 |
| JIS 1.4.2 | 1/1 | 1/1 |
| JIS 1.4.3 | 1/1 | 1/1 |
| JIS 2.1.1 | 1/1 | 1/1 |
| JIS 2.1.2 | 1/1 | 1/1 |
| JIS 2.2.1 | 1/1 | 1/1 |
| JIS 2.4.1 | 1/1 | 1/1 |
| JIS 2.4.2 | 1/1 | 1/1 |
| JIS 2.4.4 | 1/1 | 1/1 |
| JIS 2.4.7 | 1/1 | 1/1 |
| JIS 3.1.1 | 1/1 | 1/1 |
| JIS 3.3.2 | 1/1 | 1/1 |
| JIS 4.1.1 | 1/1 | 1/1 |
| JIS 4.1.2 | 1/1 | 1/1 |
| KWCAG 5.1.1 | 1/1 | 1/1 |
| KWCAG 5.3.1 | 2/2 | 2/2 |
| KWCAG 5.4.2 | 1/1 | 1/1 |
| KWCAG 5.4.3 | 1/1 | 1/1 |
| KWCAG 6.1.1 | 2/2 | 2/2 |
| KWCAG 6.1.2 | 1/1 | 1/1 |
| KWCAG 6.1.3 | 2/2 | 2/2 |
| KWCAG 6.2.1 | 1/1 | 1/1 |
| KWCAG 6.4.1 | 1/1 | 1/1 |
| KWCAG 6.4.2 | 1/1 | 1/1 |
| KWCAG 6.4.3 | 1/1 | 1/1 |
| KWCAG 7.1.1 | 1/1 | 1/1 |
| KWCAG 7.2.1 | 1/1 | 1/1 |
| KWCAG 7.3.2 | 1/1 | 1/1 |
| KWCAG 8.1.1 | 1/1 | 1/1 |
| KWCAG 8.2.1 | 1/1 | 1/1 |

## 한계

자동 판정 항목의 대표 사례만 담는다. 의미 판단·사람 확인 항목은 대상이 아니다. 외부 실무자 검토 전에는 검증된 정확도의 근거로 내세우지 않는다 (검토 기록: docs/pilot-review-log.md).
