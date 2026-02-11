import { TreeNodeData } from "../components/TreeNode";

/** Deep clone the tree */
export function cloneTree(nodes: TreeNodeData[]): TreeNodeData[] {
  return nodes.map((n) => ({
    ...n,
    children: cloneTree(n.children),
  }));
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

/** Paste a copied node as a sibling after the target node */
export function pasteNode(
  nodes: TreeNodeData[],
  targetId: number,
  copied: TreeNodeData,
  startId: number
): TreeNodeData[] {
  const tree = cloneTree(nodes);
  const ctx = findParentContext(tree, targetId);
  if (!ctx) return tree;

  const clone = cloneTree([copied])[0];
  // Adjust indent to match target
  const target = ctx.siblings[ctx.index];
  const indentDelta = target.indent - clone.indent;
  function adjustIndent(n: TreeNodeData, delta: number) {
    n.indent += delta;
    n.children.forEach((c) => adjustIndent(c, delta));
  }
  adjustIndent(clone, indentDelta);

  // Assign new IDs
  reassignIds(clone, startId);

  // Insert after target
  ctx.siblings.splice(ctx.index + 1, 0, clone);
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
