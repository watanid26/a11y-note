// 설치 전에 Node 버전을 확인한다. 이 프로젝트는 Node 22 LTS 만 지원한다 (Node 18 지원 종료).
// 오래된 Node 에서도 실행되도록 옛 문법만 쓴다.
var major = parseInt(process.versions.node.split(".")[0], 10);
if (major !== 22) {
  console.error("");
  console.error("[a11ynote] Node 22 LTS 가 필요합니다. 지금 버전: v" + process.versions.node);
  console.error("[a11ynote] Node 18·20 은 지원하지 않습니다 (테스트 도구 vitest 3 / vite 7 이 Node 18 에서 시작하지 않음).");
  console.error("[a11ynote] 해결: nvm install 22 && nvm use   (이 폴더의 .nvmrc 를 따릅니다)");
  console.error("");
  process.exit(1);
}
