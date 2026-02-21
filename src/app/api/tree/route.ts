import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export interface TreeNode {
  id: number;
  text: string;
  indent: number;
  closed: boolean;
  children: TreeNode[];
  ol?: boolean;
}

function decode(text: string): string {
  return text.replace(/%\{n\}/g, "\n").replace(/%\{s\}/g, " ");
}

function parseMemo(content: string): TreeNode[] {
  const lines = content.split("\n").filter((line) => line !== "");

  const nodes: { id: number; text: string; indent: number; closed: boolean; ol: boolean }[] =
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

    if (trimmed === "!{ol}") {
      // Mark the previous node as ordered list
      if (nodes.length > 0) {
        nodes[nodes.length - 1].ol = true;
      }
      continue;
    }

    const indent = line.length - trimmed.length;
    nodes.push({
      id: idCounter++,
      text: decode(trimmed),
      indent,
      closed: false,
      ol: false,
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
        const treeNode: TreeNode = {
          id: node.id,
          text: node.text,
          indent: node.indent,
          closed: node.closed,
          children: subChildren,
        };
        if (node.ol) treeNode.ol = true;
        children.push(treeNode);
        i = nextIndex;
      } else {
        // Deeper than expected — belongs to previous sibling's subtree
        i++;
      }
    }

    return { children, nextIndex: i };
  }

  if (nodes.length === 0) {
    return [];
  }

  // Build full tree including root
  const rootNode = nodes[0];
  const { children } = buildTree(nodes, 1, rootNode.indent);
  const root: TreeNode = {
    id: rootNode.id,
    text: rootNode.text,
    indent: rootNode.indent,
    closed: rootNode.closed,
    children,
  };
  if (rootNode.ol) root.ol = true;
  return [root];
}

const MEMO_PATH = path.join(process.cwd(), "src", "app", "api", "tree", "memo.cgi");

const INITIAL_CONTENT = "root\n";

export async function GET() {
  try {
    if (!fs.existsSync(MEMO_PATH)) {
      fs.writeFileSync(MEMO_PATH, INITIAL_CONTENT, "utf-8");
    }
    const content = fs.readFileSync(MEMO_PATH, "utf-8");
    const nodes = parseMemo(content);
    return NextResponse.json({ nodes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function encode(text: string): string {
  return text.replace(/ /g, "%{s}").replace(/\n/g, "%{n}");
}

function serializeTree(nodes: TreeNode[], indent: number): string {
  let result = "";
  for (const node of nodes) {
    const prefix = " ".repeat(indent);
    result += prefix + encode(node.text) + "\n";
    if (node.closed) {
      result += prefix + " !{close}\n";
    }
    if (node.ol) {
      result += prefix + " !{ol}\n";
    }
    if (node.children.length > 0) {
      result += serializeTree(node.children, indent + 1);
    }
  }
  return result;
}

const BACKUP_MAX = 10;

function backupPath(n: number): string {
  const dir = path.dirname(MEMO_PATH);
  const num = String(n).padStart(2, "0");
  return path.join(dir, `memo_${num}.cgi`);
}

function rotateBackups() {
  // Delete oldest if it exists
  const oldest = backupPath(BACKUP_MAX);
  if (fs.existsSync(oldest)) fs.unlinkSync(oldest);

  // Shift: _09 → _10, _08 → _09, ... _01 → _02
  for (let i = BACKUP_MAX - 1; i >= 1; i--) {
    const from = backupPath(i);
    const to = backupPath(i + 1);
    if (fs.existsSync(from)) fs.renameSync(from, to);
  }

  // Copy current to _01
  if (fs.existsSync(MEMO_PATH)) {
    fs.copyFileSync(MEMO_PATH, backupPath(1));
  }
}

export async function PUT(request: Request) {
  try {
    const { nodes } = (await request.json()) as { nodes: TreeNode[] };
    const content = serializeTree(nodes, 0);
    rotateBackups();
    fs.writeFileSync(MEMO_PATH, content, "utf-8");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
