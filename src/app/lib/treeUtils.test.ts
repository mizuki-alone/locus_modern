import { describe, it, expect } from "vitest";
import {
  filterTree, copyNode, pasteNode, findNode, nextId, moveNode,
  addSiblingBefore, addChildNodeFirst, treeToText, textToTree, treeToMarkdown, toggleOl,
} from "./treeUtils";
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

describe("moveNode（ドラッグ＆ドロップ移動）", () => {
  it("兄弟として挿入: ノードを別のノードの後に移動できる", () => {
    // 「タスク」(id:6) を「覚書」(id:1) の後に兄弟として移動
    const result = moveNode(testTree, 6, 1, "after");
    expect(result).not.toBeNull();
    // トップレベルの順序: 覚書, タスク
    expect(result!.length).toBe(2);
    expect(result![0].text).toBe("覚書");
    expect(result![1].text).toBe("タスク");
  });

  it("子として挿入: ノードを別のノードの子にできる", () => {
    // 「タスク」(id:6) を「デザイン」(id:2) の子として移動
    const result = moveNode(testTree, 6, 2, "child");
    expect(result).not.toBeNull();
    const design = findNode(result!, 2)!;
    const childTexts = design.children.map((c) => c.text);
    expect(childTexts).toContain("タスク");
  });

  it("子として挿入: 移動されたノードの子も一緒に移動する", () => {
    // 「タスク」(id:6) を「デザイン」(id:2) の子として移動
    const result = moveNode(testTree, 6, 2, "child");
    const task = findNode(result!, 6)!;
    expect(task.children.length).toBe(1);
    expect(task.children[0].text).toBe("買い物リスト");
  });

  it("自分自身への移動はnullを返す", () => {
    const result = moveNode(testTree, 1, 1, "child");
    expect(result).toBeNull();
  });

  it("自分の子孫への移動はnullを返す（ループ防止）", () => {
    // 「覚書」(id:1) を自分の子である「デザイン」(id:2) の子にはできない
    const result = moveNode(testTree, 1, 2, "child");
    expect(result).toBeNull();
  });

  it("兄弟の前に挿入: ノードを別のノードの前に移動できる", () => {
    // 「タスク」(id:6) を「覚書」(id:1) の前に移動
    const result = moveNode(testTree, 6, 1, "before");
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result![0].text).toBe("タスク");
    expect(result![1].text).toBe("覚書");
  });

  it("before と after で正しい位置に挿入される", () => {
    // 3兄弟: デザイン(2), コーディング(4) の間に「買い物リスト」(7)を挿入
    // before コーディング = デザインの後に入る
    const resultBefore = moveNode(testTree, 7, 4, "before");
    expect(resultBefore).not.toBeNull();
    const parent1 = findNode(resultBefore!, 1)!;
    expect(parent1.children.map((c) => c.text)).toEqual(["デザイン", "買い物リスト", "コーディング"]);

    // after デザイン = デザインの後に入る（同じ結果）
    const resultAfter = moveNode(testTree, 7, 2, "after");
    expect(resultAfter).not.toBeNull();
    const parent2 = findNode(resultAfter!, 1)!;
    expect(parent2.children.map((c) => c.text)).toEqual(["デザイン", "買い物リスト", "コーディング"]);
  });

  it("indent指定: 深い階層のノードの後ろに浅い階層で挿入できる", () => {
    // 「買い物リスト」(id:7) を「配色ルール」(id:3, indent:3) の後ろに、indent:2 で挿入
    // → 配色ルールの親「デザイン」(indent:2) の後ろに兄弟として入るべき
    const result = moveNode(testTree, 7, 3, "after", 2);
    expect(result).not.toBeNull();
    const parent = findNode(result!, 1)!; // 覚書
    expect(parent.children.map((c) => c.text)).toEqual(["デザイン", "買い物リスト", "コーディング"]);
  });

  it("indent指定: indent がノード自身と同じなら通常の兄弟挿入と同じ", () => {
    // 「買い物リスト」(id:7) を「配色ルール」(id:3, indent:3) の後ろに、indent:3 で挿入
    const result = moveNode(testTree, 7, 3, "after", 3);
    expect(result).not.toBeNull();
    const design = findNode(result!, 2)!; // デザイン
    expect(design.children.map((c) => c.text)).toEqual(["配色ルール", "買い物リスト"]);
  });
});

describe("addSiblingBefore（前に兄弟追加）", () => {
  it("選択ノードの前に空ノードが挿入される", () => {
    const result = addSiblingBefore(testTree, 4, 100);
    expect(result).not.toBeNull();
    const parent = findNode(result!.tree, 1)!;
    expect(parent.children.map((c) => c.text)).toEqual(["デザイン", "", "コーディング"]);
    expect(parent.children[1].id).toBe(100);
  });

  it("先頭ノードの前にも挿入できる", () => {
    const result = addSiblingBefore(testTree, 1, 100);
    expect(result).not.toBeNull();
    expect(result!.tree[0].id).toBe(100);
    expect(result!.tree[1].text).toBe("覚書");
  });
});

describe("addChildNodeFirst（先頭に子追加）", () => {
  it("親の子リストの先頭に追加される", () => {
    const { tree } = addChildNodeFirst(testTree, 1, 100);
    const parent = findNode(tree, 1)!;
    expect(parent.children[0].id).toBe(100);
    expect(parent.children[1].text).toBe("デザイン");
  });

  it("閉じていた親は展開される", () => {
    const closedTree: TreeNodeData[] = [
      { id: 1, text: "親", indent: 1, closed: true, children: [
        { id: 2, text: "子", indent: 2, closed: false, children: [] },
      ] },
    ];
    const { tree } = addChildNodeFirst(closedTree, 1, 100);
    const parent = findNode(tree, 1)!;
    expect(parent.closed).toBe(false);
    expect(parent.children[0].id).toBe(100);
  });
});

describe("treeToText / textToTree（エクスポート・インポート）", () => {
  it("treeToText がインデント付きテキストを生成する", () => {
    const text = treeToText(testTree);
    expect(text).toContain("覚書\n");
    expect(text).toContain("  デザイン\n");
    expect(text).toContain("    配色ルール\n");
  });

  it("textToTree がインデント付きテキストからツリーを生成する", () => {
    const input = "A\n  B\n  C\n    D\nE\n";
    const { nodes } = textToTree(input, 1);
    expect(nodes.length).toBe(2);
    expect(nodes[0].text).toBe("A");
    expect(nodes[0].children.length).toBe(2);
    expect(nodes[0].children[0].text).toBe("B");
    expect(nodes[0].children[1].text).toBe("C");
    expect(nodes[0].children[1].children[0].text).toBe("D");
    expect(nodes[1].text).toBe("E");
  });

  it("往復変換でテキストが保持される", () => {
    const text = treeToText(testTree);
    const { nodes } = textToTree(text, 100);
    const roundTrip = treeToText(nodes);
    expect(roundTrip).toBe(text);
  });
});

describe("treeToMarkdown（Markdown展開）", () => {
  it("ルートノードが見出しになる", () => {
    const md = treeToMarkdown(testTree[0]);
    expect(md).toMatch(/^# 覚書\n/);
  });

  it("子ノードがリスト項目になる", () => {
    const md = treeToMarkdown(testTree[0]);
    expect(md).toContain("- デザイン\n");
    expect(md).toContain("  - 配色ルール\n");
  });

  it("OLフラグがある親の子は順序付きリストになる", () => {
    const olTree: TreeNodeData = {
      id: 1, text: "手順", indent: 1, closed: false, ol: true, children: [
        { id: 2, text: "準備", indent: 2, closed: false, children: [] },
        { id: 3, text: "実行", indent: 2, closed: false, children: [] },
        { id: 4, text: "確認", indent: 2, closed: false, children: [] },
      ],
    };
    const md = treeToMarkdown(olTree);
    expect(md).toContain("1. 準備\n");
    expect(md).toContain("2. 実行\n");
    expect(md).toContain("3. 確認\n");
  });
});

describe("toggleOl（OLフラグ切替）", () => {
  it("OLフラグがtrueに設定される", () => {
    const result = toggleOl(testTree, 1);
    const node = findNode(result, 1)!;
    expect(node.ol).toBe(true);
  });

  it("OLフラグが二回トグルで元に戻る", () => {
    const first = toggleOl(testTree, 1);
    const second = toggleOl(first, 1);
    const node = findNode(second, 1)!;
    expect(node.ol).toBe(false);
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
