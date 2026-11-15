import ExtensionGuide from "./ExtensionGuide";
import { getLang } from "@/lib/lang";

export function generateMetadata() {
  return { title: getLang() === "ja" ? "Chrome拡張機能のインストール" : "크롬 확장 프로그램 설치" };
}

export default function ExtensionPage() {
  return <ExtensionGuide ja={getLang() === "ja"} />;
}
