import { TreeNodeData } from "../components/TreeNode";

/** Deep clone the tree */
export function cloneTree(nodes: TreeNodeData[]): TreeNodeData[] {
  return nodes.map((n) => {
    const clone: TreeNodeData = {
      id: n.id,
      text: n.text,
      indent: n.indent,
      closed: n.closed,
      children: cloneTree(n.children),
    };
    if (n.ol) clone.ol = true;
    return clone;
  });
}

/** Find a node by id, returning the node and its parent's children array */
export function findNode(
  nodes: TreeNodeData[],
  id: number
): TreeNodeData | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/** Find the parent of a node, returning [parentChildrenArray, indexInParent] */
export function findParentContext(
  nodes: TreeNodeData[],
  id: number
): { parent: TreeNodeData | null; siblings: TreeNodeData[]; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      return { parent: null, siblings: nodes, index: i };
    }
    const found = findParentContextInner(nodes[i], nodes[i].children, id);
    if (found) return found;
  }
  return null;
}

function findParentContextInner(
  parentNode: TreeNodeData,
  children: TreeNodeData[],
  id: number
): { parent: TreeNodeData; siblings: TreeNodeData[]; index: number } | null {
  for (let i = 0; i < children.length; i++) {
    if (children[i].id === id) {
      return { parent: parentNode, siblings: children, index: i };
    }
    const found = findParentContextInner(children[i], children[i].children, id);
    if (found) return found;
  }
  return null;
}

/** Flatten visible nodes (skip children of closed nodes) */
export function flattenVisible(nodes: TreeNodeData[]): TreeNodeData[] {
  const result: TreeNodeData[] = [];
  for (const node of nodes) {
    result.push(node);
    if (!node.closed) {
      result.push(...flattenVisible(node.children));
    }
  }
  return result;
}

/** Get the next available id */
export function nextId(nodes: TreeNodeData[]): number {
  let max = 0;
  function walk(list: TreeNodeData[]) {
    for (const n of list) {
      if (n.id > max) max = n.id;
      walk(n.children);
    }
  }
  walk(nodes);
  return max + 1;
}

/** Toggle closed state of a node */
export function toggleNode(nodes: TreeNodeData[], id: number): TreeNodeData[] {
  const tree = cloneTree(nodes);
  const node = findNode(tree, id);
  if (node && node.children.length > 0) {
    node.closed = !node.closed;
  }
  return tree;
}

/** Set closed state of a node */
export function setNodeClosed(
  nodes: TreeNodeData[],
  id: number,
  closed: boolean
): TreeNodeData[] {
  const tree = cloneTree(nodes);
  const node = findNode(tree, id);
  if (node) node.closed = closed;
  return tree;
}

/** Update the text of a node */
export function updateNodeText(
  nodes: TreeNodeData[],
  id: number,
  text: string
): TreeNodeData[] {
  const tree = cloneTree(nodes);
  const node = findNode(tree, id);
  if (node) node.text = text;
  return tree;
}

/** Add a sibling node after the given node */
export function addSiblingNode(
  nodes: TreeNodeData[],
  siblingId: number,
  newId: number
): { tree: TreeNodeData[]; newNode: TreeNodeData } | null {
  const tree = cloneTree(nodes);
  const ctx = findParentContext(tree, siblingId);
  if (!ctx) return null;

  const sibling = ctx.siblings[ctx.index];
  const newNode: TreeNodeData = {
    id: newId,
    text: "",
    indent: sibling.indent,
    closed: false,
    children: [],
  };
  ctx.siblings.splice(ctx.index + 1, 0, newNode);
  return { tree, newNode };
}

/** Add a child node to the given parent */
export function addChildNode(
  nodes: TreeNodeData[],
  parentId: number,
  newId: number
): { tree: TreeNodeData[]; newNode: TreeNodeData } {
  const tree = cloneTree(nodes);
  const parent = findNode(tree, parentId);
  const newNode: TreeNodeData = {
    id: newId,
    text: "",
    indent: parent ? parent.indent + 1 : 1,
    closed: false,
    children: [],
  };
  if (parent) {
    parent.closed = false;
    parent.children.push(newNode);
  }
  return { tree, newNode };
}

/** Delete a node by id */
export function deleteNode(
  nodes: TreeNodeData[],
  id: number
): TreeNodeData[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({
      ...n,
      children: deleteNode(n.children, id),
    }));
}

/** Delete multiple nodes by ids */
export function deleteNodes(
  nodes: TreeNodeData[],
  ids: Set<number>
): TreeNodeData[] {
  return nodes
    .filter((n) => !ids.has(n.id))
    .map((n) => ({
      ...n,
      children: deleteNodes(n.children, ids),
    }));
}

/** Indent: move node to become the last child of its previous sibling */
export function indentNode(
  nodes: TreeNodeData[],
  id: number
): TreeNodeData[] | null {
  const tree = cloneTree(nodes);
  const ctx = findParentContext(tree, id);
  if (!ctx || ctx.index === 0) return null; // no previous sibling

  const node = ctx.siblings[ctx.index];
  const prevSibling = ctx.siblings[ctx.index - 1];

  // Remove from current position
  ctx.siblings.splice(ctx.index, 1);

  // Update indent recursively
  function updateIndent(n: TreeNodeData, delta: number) {
    n.indent += delta;
    n.children.forEach((c) => updateIndent(c, delta));
  }
  updateIndent(node, 1);

  // Add as last child of previous sibling
  prevSibling.children.push(node);
  prevSibling.closed = false;

  return tree;
}

/** Outdent: move node to become the next sibling of its parent */
export function outdentNode(
  nodes: TreeNodeData[],
  id: number
): TreeNodeData[] | null {
  const tree = cloneTree(nodes);
  const ctx = findParentContext(tree, id);
  if (!ctx || !ctx.parent) return null; // already top-level

  const node = ctx.siblings[ctx.index];

  // Siblings after this node become children of this node
  const followingSiblings = ctx.siblings.splice(ctx.index + 1);
  // Remove the node itself
  ctx.siblings.splice(ctx.index, 1);

  // Update indent recursively
  function updateIndent(n: TreeNodeData, delta: number) {
    n.indent += delta;
    n.children.forEach((c) => updateIndent(c, delta));
  }

  // Following siblings become children of node
  for (const sib of followingSiblings) {
    updateIndent(sib, 1);
    node.children.push(sib);
  }
  updateIndent(node, -1);

  // Insert node after parent in grandparent's children
  const grandCtx = findParentContext(tree, ctx.parent.id);
  if (grandCtx) {
    grandCtx.siblings.splice(grandCtx.index + 1, 0, node);
  } else {
    // parent is at root level — find parent in tree array
    const parentIdx = tree.indexOf(ctx.parent);
    if (parentIdx !== -1) {
      tree.splice(parentIdx + 1, 0, node);
    }
  }

  return tree;
}

/** Move node up among siblings */
export function moveNodeUp(
  nodes: TreeNodeData[],
  id: number
): TreeNodeData[] | null {
  const tree = cloneTree(nodes);
  const ctx = findParentContext(tree, id);
  if (!ctx || ctx.index === 0) return null;

  const temp = ctx.siblings[ctx.index];
  ctx.siblings[ctx.index] = ctx.siblings[ctx.index - 1];
  ctx.siblings[ctx.index - 1] = temp;
  return tree;
}

/** Move node down among siblings */
export function moveNodeDown(
  nodes: TreeNodeData[],
  id: number
): TreeNodeData[] | null {
  const tree = cloneTree(nodes);
  const ctx = findParentContext(tree, id);
  if (!ctx || ctx.index >= ctx.siblings.length - 1) return null;

  const temp = ctx.siblings[ctx.index];
  ctx.siblings[ctx.index] = ctx.siblings[ctx.index + 1];
  ctx.siblings[ctx.index + 1] = temp;
  return tree;
}

/** Filter tree: return only nodes matching query and their ancestors */
export function filterTree(
  nodes: TreeNodeData[],
  query: string
): TreeNodeData[] {
  if (!query) return nodes;

  const lowerQuery = query.toLowerCase();

  function filter(list: TreeNodeData[]): TreeNodeData[] {
    const result: TreeNodeData[] = [];
    for (const node of list) {
      const filteredChildren = filter(node.children);
      const selfMatches = node.text.toLowerCase().includes(lowerQuery);

      if (selfMatches || filteredChildren.length > 0) {
        result.push({
          ...node,
          closed: false,
          children: filteredChildren,
        });
      }
    }
    return result;
  }

  return filter(nodes);
}

/** Copy a node (deep clone) by id. Returns null if not found. */
export function copyNode(
  nodes: TreeNodeData[],
  id: number
): TreeNodeData | null {
  const node = findNode(nodes, id);
  if (!node) return null;
  return cloneTree([node])[0];
}

/** Reassign IDs to a node and all its descendants */
function reassignIds(node: TreeNodeData, startId: number): number {
  node.id = startId;
  let nextIdVal = startId + 1;
  for (const child of node.children) {
    nextIdVal = reassignIds(child, nextIdVal);
  }
  return nextIdVal;
}

/** Copy multiple nodes by IDs.
 * - If a selected node has no selected descendants: copy entire subtree
 * - If a selected node has selected descendants: copy only selected children (recursively)
 * - Nodes whose ancestor is already selected are included via their parent, not as separate entries
 */
export function copyNodes(
  nodes: TreeNodeData[],
  ids: Set<number>
): TreeNodeData[] {
  function hasSelectedDescendant(node: TreeNodeData): boolean {
    for (const child of node.children) {
      if (ids.has(child.id)) return true;
      if (hasSelectedDescendant(child)) return true;
    }
    return false;
  }

  function cloneFiltered(node: TreeNodeData): TreeNodeData {
    if (!hasSelectedDescendant(node)) {
      // No selected descendants: copy entire subtree
      return cloneTree([node])[0];
    }
    // Has selected descendants: include only selected children (recursively)
    const clone: TreeNodeData = {
      id: node.id,
      text: node.text,
      indent: node.indent,
      closed: node.closed,
      children: [],
    };
    if (node.ol) clone.ol = true;
    for (const child of node.children) {
      if (ids.has(child.id)) {
        clone.children.push(cloneFiltered(child));
      }
    }
    return clone;
  }

  function hasSelectedAncestor(nodeId: number): boolean {
    const ctx = findParentContext(nodes, nodeId);
    if (!ctx || !ctx.parent) return false;
    if (ids.has(ctx.parent.id)) return true;
    return hasSelectedAncestor(ctx.parent.id);
  }

  const result: TreeNodeData[] = [];
  function walk(list: TreeNodeData[]) {
    for (const node of list) {
      if (ids.has(node.id) && !hasSelectedAncestor(node.id)) {
        result.push(cloneFiltered(node));
      } else {
        walk(node.children);
      }
    }
  }
  walk(nodes);
  return result;
}

/** Paste a copied node as a sibling after the target node */
export function pasteNode(
  nodes: TreeNodeData[],
  targetId: number,
  copied: TreeNodeData,
  startId: number
): TreeNodeData[] {
  return pasteNodes(nodes, targetId, [copied], startId);
}

/** Paste multiple copied nodes as siblings after the target node */
export function pasteNodes(
  nodes: TreeNodeData[],
  targetId: number,
  copied: TreeNodeData[],
  startId: number
): TreeNodeData[] {
  if (copied.length === 0) return nodes;
  const tree = cloneTree(nodes);
  const ctx = findParentContext(tree, targetId);
  if (!ctx) return tree;

  const target = ctx.siblings[ctx.index];
  let currentId = startId;

  const clones: TreeNodeData[] = [];
  for (const node of copied) {
    const clone = cloneTree([node])[0];
    // Adjust indent to match target
    const indentDelta = target.indent - clone.indent;
    function adjustIndent(n: TreeNodeData, delta: number) {
      n.indent += delta;
      n.children.forEach((c) => adjustIndent(c, delta));
    }
    adjustIndent(clone, indentDelta);
    // Assign new IDs
    currentId = reassignIds(clone, currentId);
    clones.push(clone);
  }

  // Insert all after target
  ctx.siblings.splice(ctx.index + 1, 0, ...clones);
  return tree;
}

/** Paste multiple copied nodes as siblings before the target node */
export function pasteNodesBefore(
  nodes: TreeNodeData[],
  targetId: number,
  copied: TreeNodeData[],
  startId: number
): TreeNodeData[] {
  if (copied.length === 0) return nodes;
  const tree = cloneTree(nodes);
  const ctx = findParentContext(tree, targetId);
  if (!ctx) return tree;

  const target = ctx.siblings[ctx.index];
  let currentId = startId;

  const clones: TreeNodeData[] = [];
  for (const node of copied) {
    const clone = cloneTree([node])[0];
    const indentDelta = target.indent - clone.indent;
    function adjustIndent(n: TreeNodeData, delta: number) {
      n.indent += delta;
      n.children.forEach((c) => adjustIndent(c, delta));
    }
    adjustIndent(clone, indentDelta);
    currentId = reassignIds(clone, currentId);
    clones.push(clone);
  }

  // Insert all before target
  ctx.siblings.splice(ctx.index, 0, ...clones);
  return tree;
}

/** Check if ancestorId is an ancestor of nodeId */
function isAncestor(
  nodes: TreeNodeData[],
  ancestorId: number,
  nodeId: number
): boolean {
  const ancestor = findNode(nodes, ancestorId);
  if (!ancestor) return false;
  function search(children: TreeNodeData[]): boolean {
    for (const child of children) {
      if (child.id === nodeId) return true;
      if (search(child.children)) return true;
    }
    return false;
  }
  return search(ancestor.children);
}

/** Add a sibling node before the given node */
export function addSiblingBefore(
  nodes: TreeNodeData[],
  siblingId: number,
  newId: number
): { tree: TreeNodeData[]; newNode: TreeNodeData } | null {
  const tree = cloneTree(nodes);
  const ctx = findParentContext(tree, siblingId);
  if (!ctx) return null;

  const sibling = ctx.siblings[ctx.index];
  const newNode: TreeNodeData = {
    id: newId,
    text: "",
    indent: sibling.indent,
    closed: false,
    children: [],
  };
  ctx.siblings.splice(ctx.index, 0, newNode);
  return { tree, newNode };
}

/** Add a child node at the beginning of the parent's children */
export function addChildNodeFirst(
  nodes: TreeNodeData[],
  parentId: number,
  newId: number
): { tree: TreeNodeData[]; newNode: TreeNodeData } {
  const tree = cloneTree(nodes);
  const parent = findNode(tree, parentId);
  const newNode: TreeNodeData = {
    id: newId,
    text: "",
    indent: parent ? parent.indent + 1 : 1,
    closed: false,
    children: [],
  };
  if (parent) {
    parent.closed = false;
    parent.children.unshift(newNode);
  }
  return { tree, newNode };
}

/** Convert tree to indented text */
export function treeToText(nodes: TreeNodeData[], depth: number = 0): string {
  let result = "";
  for (const node of nodes) {
    const prefix = "  ".repeat(depth);
    result += prefix + node.text + "\n";
    if (node.children.length > 0) {
      result += treeToText(node.children, depth + 1);
    }
  }
  return result;
}

/** Parse indented text into tree nodes */
export function textToTree(
  text: string,
  startId: number
): { nodes: TreeNodeData[]; nextId: number } {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return { nodes: [], nextId: startId };

  const flatNodes: { text: string; depth: number }[] = [];
  for (const line of lines) {
    const trimmed = line.replace(/^\t+/, (m) => "  ".repeat(m.length));
    const match = trimmed.match(/^(\s*)/);
    const spaces = match ? match[1].length : 0;
    const depth = Math.floor(spaces / 2);
    flatNodes.push({ text: trimmed.trim(), depth });
  }

  let idCounter = startId;

  function buildLevel(
    items: typeof flatNodes,
    startIdx: number,
    parentDepth: number,
    indent: number
  ): { nodes: TreeNodeData[]; nextIdx: number } {
    const result: TreeNodeData[] = [];
    let i = startIdx;

    while (i < items.length) {
      if (items[i].depth <= parentDepth && i > startIdx) break;
      if (items[i].depth < parentDepth) break;

      const node: TreeNodeData = {
        id: idCounter++,
        text: items[i].text,
        indent,
        closed: false,
        children: [],
      };

      // Collect children (items with greater depth)
      const childStart = i + 1;
      if (childStart < items.length && items[childStart].depth > items[i].depth) {
        const childResult = buildLevel(items, childStart, items[i].depth, indent + 1);
        node.children = childResult.nodes;
        i = childResult.nextIdx;
      } else {
        i++;
      }
      result.push(node);
    }

    return { nodes: result, nextIdx: i };
  }

  const minDepth = Math.min(...flatNodes.map((n) => n.depth));
  const { nodes } = buildLevel(flatNodes, 0, minDepth - 1, 1);
  return { nodes, nextId: idCounter };
}

/** Convert a subtree to Markdown */
export function treeToMarkdown(
  node: TreeNodeData,
  depth: number = 0,
  parentOl: boolean = false,
  siblingIndex: number = 0
): string {
  const indent = depth > 0 ? "  ".repeat(depth - 1) : "";
  const bullet = parentOl ? `${siblingIndex + 1}. ` : "- ";
  const heading = "#".repeat(Math.min(depth + 1, 6));

  let result = depth === 0
    ? `${heading} ${node.text}\n\n`
    : `${indent}${bullet}${node.text}\n`;

  if (node.children.length > 0) {
    node.children.forEach((child, idx) => {
      result += treeToMarkdown(child, depth + 1, !!node.ol, idx);
    });
  }

  return result;
}

/** Parse Markdown into tree nodes */
export function markdownToTree(
  md: string,
  startId: number,
  baseIndent: number
): { nodes: TreeNodeData[]; nextId: number } {
  const lines = md.split("\n");
  if (lines.length === 0) return { nodes: [], nextId: startId };

  // Parse each line into flat items with depth and list type
  const items: { text: string; depth: number; ol?: boolean }[] = [];
  let lastHeadingDepth = -1;

  for (const line of lines) {
    // Skip empty lines and horizontal rules
    if (line.trim() === "") continue;
    if (/^[-*_]{3,}\s*$/.test(line.trim())) continue;

    // Heading: # ~ ######
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const depth = headingMatch[1].length - 1; // # = 0, ## = 1, ...
      lastHeadingDepth = depth;
      items.push({ text: headingMatch[2].trim(), depth });
      continue;
    }

    // Unordered list: - or *
    const ulMatch = line.match(/^(\s*)[-*]\s+(.*)/);
    if (ulMatch) {
      const spaces = ulMatch[1].length;
      const listIndent = Math.floor(spaces / 2);
      const depth = lastHeadingDepth >= 0
        ? lastHeadingDepth + 1 + listIndent
        : listIndent;
      items.push({ text: ulMatch[2].trim(), depth });
      continue;
    }

    // Ordered list: 1. 2. etc.
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (olMatch) {
      const spaces = olMatch[1].length;
      const listIndent = Math.floor(spaces / 2);
      const depth = lastHeadingDepth >= 0
        ? lastHeadingDepth + 1 + listIndent
        : listIndent;
      items.push({ text: olMatch[2].trim(), depth, ol: true });
      continue;
    }

    // Plain text: child of last heading, or depth 0 if no heading
    const depth = lastHeadingDepth >= 0 ? lastHeadingDepth + 1 : 0;
    items.push({ text: line.trim(), depth });
  }

  if (items.length === 0) return { nodes: [], nextId: startId };

  // Build tree from flat items
  let idCounter = startId;

  function buildLevel(startIdx: number, parentDepth: number): { nodes: TreeNodeData[]; nextIdx: number } {
    const result: TreeNodeData[] = [];
    let i = startIdx;

    while (i < items.length) {
      if (items[i].depth <= parentDepth && i > startIdx) break;
      if (items[i].depth < parentDepth) break;

      const node: TreeNodeData = {
        id: idCounter++,
        text: items[i].text,
        indent: baseIndent + items[i].depth,
        closed: false,
        children: [],
      };

      const childStart = i + 1;
      if (childStart < items.length && items[childStart].depth > items[i].depth) {
        // Check if child items are from an ordered list
        if (items[childStart].ol) {
          node.ol = true;
        }
        const childResult = buildLevel(childStart, items[i].depth);
        node.children = childResult.nodes;
        i = childResult.nextIdx;
      } else {
        i++;
      }
      result.push(node);
    }

    return { nodes: result, nextIdx: i };
  }

  const minDepth = Math.min(...items.map((it) => it.depth));
  const { nodes } = buildLevel(0, minDepth - 1);
  return { nodes, nextId: idCounter };
}

/** Merge source node into target: concatenate text, move children, remove source */
export function mergeNodes(
  nodes: TreeNodeData[],
  targetId: number,
  sourceId: number,
  targetText: string,
  sourceText: string
): { tree: TreeNodeData[]; joinPoint: number } | null {
  const tree = cloneTree(nodes);
  const joinPoint = targetText.length;

  const target = findNode(tree, targetId);
  if (!target) return null;
  target.text = targetText + sourceText;

  const source = findNode(tree, sourceId);
  if (!source) return null;

  // Move source's children to target, adjusting indent
  if (source.children.length > 0) {
    function updateIndent(n: TreeNodeData, delta: number) {
      n.indent += delta;
      n.children.forEach((c) => updateIndent(c, delta));
    }
    for (const child of source.children) {
      const delta = target.indent + 1 - child.indent;
      updateIndent(child, delta);
      target.children.push(child);
    }
    target.closed = false;
  }

  // Remove source from tree
  const sourceCtx = findParentContext(tree, sourceId);
  if (!sourceCtx) return null;
  sourceCtx.siblings.splice(sourceCtx.index, 1);

  return { tree, joinPoint };
}

/** Count all nodes in the tree recursively */
export function countAllNodes(nodes: TreeNodeData[]): number {
  let count = 0;
  for (const node of nodes) {
    count++;
    count += countAllNodes(node.children);
  }
  return count;
}

/** Toggle OL (ordered list) flag on a node */
export function toggleOl(
  nodes: TreeNodeData[],
  id: number
): TreeNodeData[] {
  const tree = cloneTree(nodes);
  const node = findNode(tree, id);
  if (node) node.ol = !node.ol;
  return tree;
}

/** Get the IDs of sibling nodes between id1 and id2 (inclusive).
 *  Returns null if id1 and id2 are not siblings (different parent). */
export function getSiblingRange(
  nodes: TreeNodeData[],
  id1: number,
  id2: number
): number[] | null {
  const ctx1 = findParentContext(nodes, id1);
  const ctx2 = findParentContext(nodes, id2);
  if (!ctx1 || !ctx2) return null;

  // Check same parent: both must share the same siblings array
  const sameParent =
    ctx1.parent === ctx2.parent &&
    ctx1.siblings === ctx2.siblings;
  if (!sameParent) return null;

  const start = Math.min(ctx1.index, ctx2.index);
  const end = Math.max(ctx1.index, ctx2.index);
  return ctx1.siblings.slice(start, end + 1).map((n) => n.id);
}

/** Move a node to a new position. mode: "after" = sibling after target, "child" = child of target.
 *  targetIndent: optional indent level for before/after — walks up ancestors to find insertion point. */
export function moveNode(
  nodes: TreeNodeData[],
  dragId: number,
  targetId: number,
  mode: "before" | "after" | "child",
  targetIndent?: number
): TreeNodeData[] | null {
  if (dragId === targetId) return null;
  if (isAncestor(nodes, dragId, targetId)) return null;

  const tree = cloneTree(nodes);

  // Remove dragged node from its current position
  const dragCtx = findParentContext(tree, dragId);
  if (!dragCtx) return null;
  const dragNode = dragCtx.siblings.splice(dragCtx.index, 1)[0];

  if (mode === "child") {
    const target = findNode(tree, targetId);
    if (!target) return null;
    const delta = target.indent + 1 - dragNode.indent;
    function adjustIndent(n: TreeNodeData, d: number) {
      n.indent += d;
      n.children.forEach((c) => adjustIndent(c, d));
    }
    adjustIndent(dragNode, delta);
    target.children.push(dragNode);
    target.closed = false;
  } else {
    // Walk up ancestors if a shallower indent is requested
    let effectiveTargetId = targetId;
    if (targetIndent !== undefined) {
      const targetNode = findNode(tree, targetId);
      if (targetNode && targetIndent < targetNode.indent) {
        let currentId = targetId;
        let current = targetNode;
        while (current && current.indent > targetIndent) {
          const ctx = findParentContext(tree, currentId);
          if (ctx?.parent) {
            currentId = ctx.parent.id;
            current = ctx.parent;
          } else {
            break;
          }
        }
        if (current && current.indent === targetIndent) {
          effectiveTargetId = currentId;
        }
      }
    }

    const targetCtx = findParentContext(tree, effectiveTargetId);
    if (!targetCtx) return null;
    const target = targetCtx.siblings[targetCtx.index];
    const delta = target.indent - dragNode.indent;
    function adjustIndent(n: TreeNodeData, d: number) {
      n.indent += d;
      n.children.forEach((c) => adjustIndent(c, d));
    }
    adjustIndent(dragNode, delta);
    const insertIndex = mode === "before" ? targetCtx.index : targetCtx.index + 1;
    targetCtx.siblings.splice(insertIndex, 0, dragNode);
  }

  return tree;
}
