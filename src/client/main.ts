/**
 * ブラウザ側のエントリポイント。
 * 目次の追従、mermaid の描画、ライブリロードの購読を起動する。
 */
import { renderDiagrams } from "./mermaid.ts";
import { startLiveReload } from "./reload.ts";
import { setupTocHighlight } from "./toc.ts";
import { setupTreeState } from "./tree.ts";

setupTreeState();
setupTocHighlight();
void renderDiagrams();
startLiveReload();
