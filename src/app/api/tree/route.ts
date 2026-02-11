import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export interface TreeNode {
  id: number;
  text: string;
  indent: number;
  closed: boolean;
  children: TreeNode[];
}

function decode(text: string): string {
  return text.replace(/%\{n\}/g, "\n").replace(/%\{s\}/g, " ");
}

function parseMemo(content: string): TreeNode[] {
  const lines = content.split("\n").filter((line) => line !== "");

  const nodes: { id: number; text: string; indent: number; closed: boolean }[] =
    [];
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed === "!{close}") {
      // Mark the previous node as closed
      if (nodes.length > 0) {
        nodes[nodes.length - 1].closed = true;
      }
      continue;
    }

    const indent = line.length - trimmed.length;
    nodes.push({
      id: idCounter++,
      text: decode(trimmed),
      indent,
      closed: false,
    });
  }

  // Skip root node (indent 0), build tree from its children
  function buildTree(
    flatNodes: typeof nodes,
    startIndex: number,
    parentIndent: number
  ): { children: TreeNode[]; nextIndex: number } {
    const children: TreeNode[] = [];

    let i = startIndex;
    while (i < flatNodes.length) {
      const node = flatNodes[i];

      if (node.indent <= parentIndent) {
        break;
      }

      if (node.indent === parentIndent + 1) {
        const { children: subChildren, nextIndex } = buildTree(
          flatNodes,
          i + 1,
          node.indent
        );
        children.push({
          id: node.id,
          text: node.text,
          indent: node.indent,
          closed: node.closed,
          children: subChildren,
        });
        i = nextIndex;
      } else {
        // Deeper than expected — belongs to previous sibling's subtree
        i++;
      }
    }

    return { children, nextIndex: i };
  }

  // Root node is the first node at indent 0; skip it and build from its children
  if (nodes.length === 0) {
    return [];
  }

  const rootIndent = nodes[0].indent;
  const { children } = buildTree(nodes, 1, rootIndent);
  return children;
}

export async function GET() {
  try {
    const memoPath = path.join(process.cwd(), "src", "app", "api", "tree", "memo.cgi");
    const content = fs.readFileSync(memoPath, "utf-8");
    const nodes = parseMemo(content);
    return NextResponse.json({ nodes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
