import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MEMO_DIR = path.join(process.cwd(), "src", "app", "api", "tree");
const MEMO_PATH = path.join(MEMO_DIR, "memo.cgi");

function decode(text: string): string {
  return text.replace(/%\{n\}/g, "\n").replace(/%\{s\}/g, " ");
}

interface TreeNode {
  id: number;
  text: string;
  indent: number;
  closed: boolean;
  children: TreeNode[];
  ol?: boolean;
}

function parseMemo(content: string): TreeNode[] {
  const lines = content.split("\n").filter((line) => line !== "");
  const nodes: { id: number; text: string; indent: number; closed: boolean; ol: boolean }[] = [];
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed === "!{close}") {
      if (nodes.length > 0) nodes[nodes.length - 1].closed = true;
      continue;
    }
    if (trimmed === "!{ol}") {
      if (nodes.length > 0) nodes[nodes.length - 1].ol = true;
      continue;
    }

    const indent = line.length - trimmed.length;
    nodes.push({ id: idCounter++, text: decode(trimmed), indent, closed: false, ol: false });
  }

  if (nodes.length === 0) return [];

  function buildTree(
    flatNodes: typeof nodes,
    startIndex: number,
    parentIndent: number
  ): { children: TreeNode[]; nextIndex: number } {
    const children: TreeNode[] = [];
    let i = startIndex;
    while (i < flatNodes.length) {
      const node = flatNodes[i];
      if (node.indent <= parentIndent) break;
      if (node.indent === parentIndent + 1) {
        const { children: subChildren, nextIndex } = buildTree(flatNodes, i + 1, node.indent);
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
        i++;
      }
    }
    return { children, nextIndex: i };
  }

  const rootIndent = nodes[0].indent;
  const { children } = buildTree(nodes, 1, rootIndent);
  return children;
}

/** GET: list available backups with modification times */
export async function GET() {
  try {
    const files = fs.readdirSync(MEMO_DIR);
    const backups = files
      .filter((f) => /^memo_\d+\.cgi$/.test(f))
      .map((f) => {
        const stat = fs.statSync(path.join(MEMO_DIR, f));
        return { name: f, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime)); // newest first
    return NextResponse.json({ backups });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST: restore from a specific backup */
export async function POST(request: Request) {
  try {
    const { backup } = (await request.json()) as { backup: string };

    // Validate backup filename to prevent path traversal
    if (!/^memo_\d+\.cgi$/.test(backup)) {
      return NextResponse.json({ error: "Invalid backup name" }, { status: 400 });
    }

    const backupFile = path.join(MEMO_DIR, backup);
    if (!fs.existsSync(backupFile)) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    const content = fs.readFileSync(backupFile, "utf-8");

    // Write backup content to main file
    fs.writeFileSync(MEMO_PATH, content, "utf-8");

    // Parse and return the restored tree
    const nodes = parseMemo(content);
    return NextResponse.json({ nodes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
