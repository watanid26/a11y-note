// node(워커·스크립트)에서 쓰는 엔진 버전 문자열. 브라우저 번들(page/index.ts)과 같은 값.
import axe from "axe-core";
import { CORE_VERSION } from "./version";
export const ENGINE_VERSION = `a11ynote-core ${CORE_VERSION} / axe-core ${axe.version}`;
