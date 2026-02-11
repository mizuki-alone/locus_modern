import { describe, it, expect } from "vitest";
import { filterTree, copyNode, pasteNode, findNode, nextId } from "./treeUtils";
import { TreeNodeData } from "../components/TreeNode";

// テスト用のツリー構造
// 覚書
//   デザイン
//     配色ルール
//   コーディング
//     TypeScript入門
// タスク
//   買い物リスト
const testTree: TreeNodeData[] = [
  {
    id: 1,
    text: "覚書",
    indent: 1,
    closed: false,
    children: [
      {
        id: 2,
        text: "デザイン",
        indent: 2,
        closed: false,
        children: [
          { id: 3, text: "配色ルール", indent: 3, closed: false, children: [] },
        ],
      },
      {
        id: 4,
        text: "コーディング",
        indent: 2,
        closed: false,
        children: [
          { id: 5, text: "TypeScript入門", indent: 3, closed: false, children: [] },
        ],
      },
    ],
  },
  {
    id: 6,
    text: "タスク",
    indent: 1,
    closed: false,
    children: [
      { id: 7, text: "買い物リスト", indent: 2, closed: false, children: [] },
    ],
  },
];

describe("filterTree（検索フィルタ）", () => {
  it("空文字で検索すると全ノードがそのまま返る", () => {
    const result = filterTree(testTree, "");
    expect(result).toEqual(testTree);
  });

  it("一致するノードが返る", () => {
    const result = filterTree(testTree, "TypeScript");
    const visible = collectTexts(result);
    expect(visible).toContain("TypeScript入門");
  });

  it("一致するノードの親も表示される（パス維持）", () => {
    const result = filterTree(testTree, "TypeScript");
    const visible = collectTexts(result);
    expect(visible).toContain("覚書");
    expect(visible).toContain("コーディング");
  });

  it("一致しないブランチは非表示になる", () => {
    const result = filterTree(testTree, "TypeScript");
    const visible = collectTexts(result);
    expect(visible).not.toContain("デザイン");
    expect(visible).not.toContain("配色ルール");
    expect(visible).not.toContain("タスク");
    expect(visible).not.toContain("買い物リスト");
  });

  it("大文字小文字を区別しない", () => {
    const result = filterTree(testTree, "typescript");
    const visible = collectTexts(result);
    expect(visible).toContain("TypeScript入門");
  });
});

describe("copyNode / pasteNode（コピー＆ペースト）", () => {
  it("ノードをコピーすると子ノードも含まれる", () => {
    // 「デザイン」(id:2) をコピー → 子の「配色ルール」も含まれる
    const copied = copyNode(testTree, 2);
    expect(copied).not.toBeNull();
    expect(copied!.text).toBe("デザイン");
    expect(copied!.children.length).toBe(1);
    expect(copied!.children[0].text).toBe("配色ルール");
  });

  it("ペーストすると選択ノードの直下に兄弟として挿入される", () => {
    const copied = copyNode(testTree, 2)!;
    const startId = nextId(testTree);
    const result = pasteNode(testTree, 2, copied, startId);
    // 「デザイン」の直後に複製が入る
    const parent = findNode(result, 1)!; // 覚書
    expect(parent.children.length).toBe(3); // デザイン, コピー, コーディング
    expect(parent.children[0].text).toBe("デザイン");
    expect(parent.children[1].text).toBe("デザイン");
    expect(parent.children[2].text).toBe("コーディング");
  });

  it("ペーストされたノードは新しいIDを持つ", () => {
    const copied = copyNode(testTree, 2)!;
    const startId = nextId(testTree);
    const result = pasteNode(testTree, 2, copied, startId);
    const parent = findNode(result, 1)!;
    // 元のデザイン(id:2)とは異なるID
    expect(parent.children[1].id).not.toBe(2);
    // 子ノードも新しいID
    expect(parent.children[1].children[0].id).not.toBe(3);
  });

  it("存在しないノードをコピーするとnullが返る", () => {
    const copied = copyNode(testTree, 999);
    expect(copied).toBeNull();
  });
});

/** ツリーから全ノードのテキストを収集するヘルパー */
function collectTexts(nodes: TreeNodeData[]): string[] {
  const texts: string[] = [];
  for (const node of nodes) {
    texts.push(node.text);
    texts.push(...collectTexts(node.children));
  }
  return texts;
}
