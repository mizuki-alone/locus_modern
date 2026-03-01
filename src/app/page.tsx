"use client";

import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from "react";
import TreeNode, { TreeNodeData } from "./components/TreeNode";
import {
  flattenVisible,
  findNode,
  findParentContext,
  toggleNode,
  setNodeClosed,
  updateNodeText,
  addSiblingNode,
  addSiblingBefore,
  addChildNode,
  addChildNodeFirst,
  deleteNode,
  deleteNodes,
  indentNode,
  outdentNode,
  moveNodeUp,
  moveNodeDown,
  nextId,
  filterTree,
  copyNode,
  copyNodes,
  pasteNode,
  pasteNodes,
  moveNode,
  countAllNodes,
  treeToText,
  textToTree,
  treeToMarkdown,
  markdownToTree,
  toggleOl,
  getSiblingRange,
  mergeNodes,
} from "./lib/treeUtils";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ModalType = "import" | "export" | "markdown" | "import-md" | "shortcuts" | null;
type ThemeMode = "dark" | "light";
type UndoEntry = { nodes: TreeNodeData[]; selectedId: number | null };

export default function Home() {
  const [nodes, setNodes] = useState<TreeNodeData[]>([]);
  const [selectedId, setSelectedIdRaw] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  const setSelectedId = useCallback((id: number | null) => {
    selectedIdRef.current = id;
    setSelectedIdRaw(id);
  }, []);
  const [editingId, setEditingIdRaw] = useState<number | null>(null);
  const editingIdRef = useRef<number | null>(null);
  const setEditingId = useCallback((id: number | null) => {
    editingIdRef.current = id;
    setEditingIdRaw(id);
  }, []);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndexRaw] = useState<number | null>(null);
  const searchIndexRef = useRef<number | null>(null);
  const setSearchIndex = useCallback((idx: number | null) => {
    searchIndexRef.current = idx;
    setSearchIndexRaw(idx);
  }, []);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const clipboardRef = useRef<TreeNodeData[]>([]);
  const [hasTreeClipboard, setHasTreeClipboard] = useState(false);
  const [clipboardMsg, setClipboardMsg] = useState<string | null>(null);
  const clipboardMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const skipScrollRef = useRef(false);
  const addOriginRef = useRef<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectedIdsRef = useRef<Set<number>>(new Set());
  const setSelectedIdsWrapped = useCallback((ids: Set<number>) => {
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
  }, []);
  const selectionAnchorRef = useRef<number | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [modalText, setModalText] = useState("");
  const [backups, setBackups] = useState<{ name: string; mtime: string }[]>([]);
  const [showBackups, setShowBackups] = useState(false);
  const [editOnAdd, setEditOnAdd] = useState(true);
  const prevCountRef = useRef<number | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const cursorPositionRef = useRef<number | undefined>(undefined);
  const [editTrigger, setEditTrigger] = useState(0);

  const saveTree = useCallback((data: TreeNodeData[]) => {
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    fetch("/api/tree", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: data }),
    })
      .then((res) => {
        setSaveStatus(res.ok ? "saved" : "error");
        saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      })
      .catch(() => {
        setSaveStatus("error");
        saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
      });
  }, []);

  const nodesRef = useRef<TreeNodeData[]>([]);

  useEffect(() => {
    fetch("/api/tree")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setNodes(data.nodes);
          nodesRef.current = data.nodes;
          prevCountRef.current = countAllNodes(data.nodes);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  // Theme: load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    }
  }, []);

  // Theme: apply dark class to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      return next;
    });
  }, []);

  const UNDO_LIMIT = 50;

  const update = useCallback(
    (newNodes: TreeNodeData[]) => {
      // Check for significant node count drop before saving
      const newCount = countAllNodes(newNodes);
      const prevCount = prevCountRef.current;
      if (prevCount !== null && prevCount > 0) {
        const decrease = (prevCount - newCount) / prevCount;
        if (decrease >= 0.1) {
          const pct = Math.round(decrease * 100);
          const ok = window.confirm(
            `Node count dropped from ${prevCount.toLocaleString()} to ${newCount.toLocaleString()} (${pct}% decrease). Save anyway?`
          );
          if (!ok) {
            // Don't save — undo is not needed since we haven't pushed yet
            return;
          }
        }
      }

      undoStack.current.push({ nodes: nodesRef.current, selectedId: selectedIdRef.current });
      if (undoStack.current.length > UNDO_LIMIT) {
        undoStack.current.splice(0, undoStack.current.length - UNDO_LIMIT);
      }
      redoStack.current = [];
      nodesRef.current = newNodes;
      setNodes(newNodes);
      saveTree(newNodes);
      prevCountRef.current = newCount;
    },
    [saveTree]
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push({ nodes: nodesRef.current, selectedId: selectedIdRef.current });
    nodesRef.current = prev.nodes;
    setNodes(prev.nodes);
    setSelectedId(prev.selectedId);
    // Re-enter edit mode on restored selection
    if (prev.selectedId !== null) {
      const node = findNode(prev.nodes, prev.selectedId);
      if (node) {
        cursorPositionRef.current = 0;
        setEditingId(prev.selectedId);
        setEditText(node.text);
      } else {
        setEditingId(null);
      }
    } else {
      setEditingId(null);
    }
    saveTree(prev.nodes);
    prevCountRef.current = countAllNodes(prev.nodes);
  }, [saveTree, setSelectedId, setEditingId]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({ nodes: nodesRef.current, selectedId: selectedIdRef.current });
    nodesRef.current = next.nodes;
    setNodes(next.nodes);
    setSelectedId(next.selectedId);
    // Re-enter edit mode on restored selection
    if (next.selectedId !== null) {
      const node = findNode(next.nodes, next.selectedId);
      if (node) {
        cursorPositionRef.current = 0;
        setEditingId(next.selectedId);
        setEditText(node.text);
      } else {
        setEditingId(null);
      }
    } else {
      setEditingId(null);
    }
    saveTree(next.nodes);
    prevCountRef.current = countAllNodes(next.nodes);
  }, [saveTree, setSelectedId, setEditingId]);

  const startEdit = useCallback(
    (id: number, cursorPos?: number) => {
      const node = findNode(nodesRef.current, id);
      if (node) {
        cursorPositionRef.current = cursorPos;
        setSelectedId(id);
        setEditingId(id);
        setEditText(node.text);
      }
    },
    [setEditingId, setSelectedId]
  );

  const confirmEdit = useCallback(() => {
    if (editingId === null) return;
    const newNodes = updateNodeText(nodes, editingId, editText);
    update(newNodes);
    setEditingId(null);
  }, [nodes, editingId, editText, update]);

  const cancelEdit = useCallback(() => {
    // If editing a new empty node, delete it and return selection to the origin node
    if (editingId !== null) {
      const node = findNode(nodes, editingId);
      if (node && node.text === "" && editText === "") {
        const newNodes = deleteNode(nodes, editingId);
        update(newNodes);
        setSelectedId(addOriginRef.current);
        addOriginRef.current = null;
      }
    }
    setEditingId(null);
  }, [editingId, nodes, editText, update, setSelectedId]);

  const splitEdit = useCallback((before: string, after: string) => {
    if (editingId === null) return;
    // Update current node text to 'before'
    let tree = updateNodeText(nodes, editingId, before);
    // Add sibling after current node
    const newId = nextId(tree);
    const result = addSiblingNode(tree, editingId, newId);
    if (!result) return;
    tree = result.tree;
    // Set the new node's text to 'after'
    tree = updateNodeText(tree, newId, after);
    update(tree);
    // Enter editing on the new node
    cursorPositionRef.current = 0;
    setSelectedId(newId);
    setEditingId(newId);
    setEditText(after);
  }, [editingId, nodes, update, setSelectedId]);

  const displayNodes = searchQuery ? filterTree(nodes, searchQuery) : nodes;

  const mergeWithPrevious = useCallback(
    (text: string) => {
      if (editingIdRef.current === null) return;
      const currentId = editingIdRef.current;

      const ctx = findParentContext(nodesRef.current, currentId);
      if (!ctx) return;

      // First child with empty text: delete and move to parent's end
      if (ctx.index === 0 && text === "" && ctx.parent) {
        const newNodes = deleteNode(nodesRef.current, currentId);
        setEditingId(null);
        update(newNodes);
        setSelectedId(ctx.parent.id);
        startEdit(ctx.parent.id, ctx.parent.text.length);
        return;
      }

      // Only merge with previous sibling
      if (ctx.index <= 0) return;

      const prevSibling = ctx.siblings[ctx.index - 1];
      const result = mergeNodes(nodesRef.current, prevSibling.id, currentId, prevSibling.text, text);
      if (!result) return;

      setEditingId(null);
      update(result.tree);
      setSelectedId(prevSibling.id);
      startEdit(prevSibling.id, result.joinPoint);
    },
    [update, setSelectedId, startEdit, setEditingId]
  );

  const mergeWithNext = useCallback(
    (text: string) => {
      if (editingIdRef.current === null) return;
      const currentId = editingIdRef.current;
      const visible = flattenVisible(
        searchQuery ? filterTree(nodesRef.current, searchQuery) : nodesRef.current
      );
      const currentIndex = visible.findIndex((n) => n.id === currentId);

      // Empty text: delete current node
      if (text === "") {
        // Last visible node — do nothing
        if (currentIndex >= visible.length - 1) return;
        const ctx = findParentContext(nodesRef.current, currentId);
        const isLastChild = ctx && ctx.index === ctx.siblings.length - 1;
        const newNodes = deleteNode(nodesRef.current, currentId);
        update(newNodes);
        if (!isLastChild && currentIndex < visible.length - 1) {
          const nextNode = visible[currentIndex + 1];
          startEdit(nextNode.id, 0);
        } else if (currentIndex > 0) {
          const prevNode = visible[currentIndex - 1];
          startEdit(prevNode.id, prevNode.text.length);
        }
        return;
      }

      if (currentIndex >= visible.length - 1) return;

      // Last child of parent: don't merge with next (it's from a different level)
      const ctx = findParentContext(nodesRef.current, currentId);
      if (ctx && ctx.index === ctx.siblings.length - 1) return;

      const nextNode = visible[currentIndex + 1];
      const result = mergeNodes(nodesRef.current, currentId, nextNode.id, text, nextNode.text);
      if (!result) return;

      update(result.tree);
      // Same node stays editing — update text and trigger cursor reposition
      setEditText(text + nextNode.text);
      cursorPositionRef.current = result.joinPoint;
      setEditTrigger((prev) => prev + 1);
    },
    [searchQuery, update, startEdit]
  );

  const indentEditing = useCallback(
    (cursorPos: number) => {
      if (editingIdRef.current === null) return;
      const currentId = editingIdRef.current;
      // Save current text, then indent
      const tree = updateNodeText(nodesRef.current, currentId, editText);
      const indented = indentNode(tree, currentId);
      if (!indented) return;

      update(indented);
      cursorPositionRef.current = cursorPos;
      setEditTrigger((prev) => prev + 1);
    },
    [editText, update]
  );

  const outdentEditing = useCallback(
    (cursorPos: number) => {
      if (editingIdRef.current === null) return;
      const currentId = editingIdRef.current;
      // Save current text, then outdent
      const tree = updateNodeText(nodesRef.current, currentId, editText);
      const outdented = outdentNode(tree, currentId);
      if (!outdented) return;

      update(outdented);
      cursorPositionRef.current = cursorPos;
      setEditTrigger((prev) => prev + 1);
    },
    [editText, update]
  );

  const deselectNode = useCallback(() => {
    setEditingId(null);
    setSelectedId(null);
  }, [setEditingId, setSelectedId]);

  const moveToPreviousEnd = useCallback((cursorPos?: number) => {
    if (editingIdRef.current === null) return;
    const currentId = editingIdRef.current;

    // Confirm current edit
    const tree = updateNodeText(nodesRef.current, currentId, editText);
    setEditingId(null);
    update(tree);

    // Navigate to previous visible node
    const visible = flattenVisible(
      searchQuery ? filterTree(tree, searchQuery) : tree
    );
    const currentIndex = visible.findIndex((n) => n.id === currentId);
    if (currentIndex <= 0) return;

    const prevId = visible[currentIndex - 1].id;
    setSelectedId(prevId);
    startEdit(prevId, cursorPos !== undefined ? cursorPos : Infinity);
  }, [editText, searchQuery, update, setSelectedId, startEdit, setEditingId]);

  const moveToNextStart = useCallback(() => {
    if (editingIdRef.current === null) return;
    const currentId = editingIdRef.current;

    const tree = updateNodeText(nodesRef.current, currentId, editText);
    setEditingId(null);
    update(tree);

    const visible = flattenVisible(
      searchQuery ? filterTree(tree, searchQuery) : tree
    );
    const currentIndex = visible.findIndex((n) => n.id === currentId);

    if (currentIndex >= visible.length - 1) return;

    const nextNodeId = visible[currentIndex + 1].id;
    setSelectedId(nextNodeId);
    startEdit(nextNodeId, 0);
  }, [editText, searchQuery, update, setSelectedId, startEdit, setEditingId]);

  const shiftBoundary = useCallback((direction: 'up' | 'down') => {
    const id = editingIdRef.current ?? selectedIdRef.current;
    if (id === null) return;

    setEditingId(null);

    const visible = flattenVisible(displayNodes);
    const currentIndex = visible.findIndex(n => n.id === id);

    const newIndex = direction === 'up'
      ? Math.max(0, currentIndex - 1)
      : Math.min(visible.length - 1, currentIndex + 1);
    if (newIndex === currentIndex) return;

    const newId = visible[newIndex].id;

    // Set anchor on first shift-select
    if (selectionAnchorRef.current === null) {
      selectionAnchorRef.current = id;
    }

    // Compute sibling range — if out of sibling scope, don't move
    const range = getSiblingRange(nodes, selectionAnchorRef.current, newId);
    if (!range) return;

    setSelectedId(newId);
    setSelectedIdsWrapped(new Set(range));

    // Scroll new selection into view
    skipScrollRef.current = true;
    const el = document.querySelector(`[data-node-id="${newId}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.top < 0) {
        window.scrollBy(0, rect.top);
      } else if (rect.bottom > window.innerHeight) {
        window.scrollBy(0, rect.bottom - window.innerHeight);
      }
    }
  }, [displayNodes, nodes, setEditingId, setSelectedId, setSelectedIdsWrapped]);

  const treePaste = useCallback(() => {
    const id = selectedIdRef.current;
    if (id === null || clipboardRef.current.length === 0) return;
    const startId = nextId(nodesRef.current);
    const newNodes = pasteNodes(nodesRef.current, id, clipboardRef.current, startId);
    update(newNodes);
    // Select last pasted node
    const visible = flattenVisible(
      searchQuery ? filterTree(newNodes, searchQuery) : newNodes
    );
    const targetIndex = visible.findIndex((n) => n.id === id);
    if (targetIndex !== -1 && targetIndex + clipboardRef.current.length < visible.length) {
      setSelectedId(visible[targetIndex + clipboardRef.current.length].id);
    }
    setClipboardMsg(`Pasted ${clipboardRef.current.length} node(s)`);
    if (clipboardMsgTimer.current) clearTimeout(clipboardMsgTimer.current);
    clipboardMsgTimer.current = setTimeout(() => setClipboardMsg(null), 2000);
  }, [searchQuery, update, setSelectedId]);

  const treeCopy = useCallback(() => {
    const id = selectedIdRef.current;
    if (id === null) return;
    const selectedIds = selectedIdsRef.current;
    if (selectedIds.size > 0) {
      clipboardRef.current = copyNodes(nodesRef.current, selectedIds);
    } else {
      const copied = copyNode(nodesRef.current, id);
      clipboardRef.current = copied ? [copied] : [];
    }
    setHasTreeClipboard(clipboardRef.current.length > 0);
    if (clipboardRef.current.length > 0) {
      setClipboardMsg(`Copied ${clipboardRef.current.length} node(s)`);
      if (clipboardMsgTimer.current) clearTimeout(clipboardMsgTimer.current);
      clipboardMsgTimer.current = setTimeout(() => setClipboardMsg(null), 2000);
    }
  }, []);

  const textCopied = useCallback(() => {
    setClipboardMsg("Text copied");
    if (clipboardMsgTimer.current) clearTimeout(clipboardMsgTimer.current);
    clipboardMsgTimer.current = setTimeout(() => setClipboardMsg(null), 2000);
  }, []);

  const treeCut = useCallback(() => {
    const id = selectedIdRef.current;
    if (id === null) return;
    const currentNodes = nodesRef.current;
    const selectedIds = selectedIdsRef.current;
    const showCutMsg = (count: number) => {
      setClipboardMsg(`Cut ${count} node(s)`);
      if (clipboardMsgTimer.current) clearTimeout(clipboardMsgTimer.current);
      clipboardMsgTimer.current = setTimeout(() => setClipboardMsg(null), 2000);
    };
    if (selectedIds.size > 0) {
      clipboardRef.current = copyNodes(currentNodes, selectedIds);
      setHasTreeClipboard(true);
      showCutMsg(clipboardRef.current.length);
      const visible = flattenVisible(displayNodes);
      const currentIndex = visible.findIndex((n) => n.id === id);
      const newNodes = deleteNodes(currentNodes, selectedIds);
      update(newNodes);
      setSelectedIdsWrapped(new Set());
      selectionAnchorRef.current = null;
      const newVisible = flattenVisible(
        searchQuery ? filterTree(newNodes, searchQuery) : newNodes
      );
      if (newVisible.length === 0) {
        setSelectedId(null);
      } else if (currentIndex < newVisible.length) {
        setSelectedId(newVisible[currentIndex].id);
      } else {
        setSelectedId(newVisible[newVisible.length - 1].id);
      }
    } else {
      const copied = copyNode(currentNodes, id);
      if (copied) {
        clipboardRef.current = [copied];
        setHasTreeClipboard(true);
        showCutMsg(1);
        const visible = flattenVisible(displayNodes);
        const currentIndex = visible.findIndex((n) => n.id === id);
        const newNodes = deleteNode(currentNodes, id);
        update(newNodes);
        const newVisible = flattenVisible(
          searchQuery ? filterTree(newNodes, searchQuery) : newNodes
        );
        if (newVisible.length === 0) {
          setSelectedId(null);
        } else if (currentIndex < newVisible.length) {
          setSelectedId(newVisible[currentIndex].id);
        } else {
          setSelectedId(newVisible[newVisible.length - 1].id);
        }
      }
    }
  }, [displayNodes, searchQuery, update, setSelectedId, setSelectedIdsWrapped]);

  const nodeCount = useMemo(() => countAllNodes(nodes), [nodes]);

  // Collect search-matching node IDs in display order
  const searchMatchIds = useMemo(() => {
    if (!searchQuery) return [];
    const lowerQuery = searchQuery.toLowerCase();
    const matchSet = new Set<number>();
    function walk(list: TreeNodeData[]) {
      for (const node of list) {
        if (node.text.toLowerCase().includes(lowerQuery)) matchSet.add(node.id);
        walk(node.children);
      }
    }
    walk(nodes);
    const visible = flattenVisible(displayNodes);
    return visible.filter(n => matchSet.has(n.id)).map(n => n.id);
  }, [nodes, searchQuery, displayNodes]);

  const searchHitCount = searchMatchIds.length;

  // Navigate to next/prev search match
  const navigateSearch = useCallback((direction: 1 | -1) => {
    if (searchMatchIds.length === 0) return;
    const current = searchIndexRef.current ?? -1;
    let newIdx = current + direction;
    if (newIdx >= searchMatchIds.length) newIdx = 0;
    if (newIdx < 0) newIdx = searchMatchIds.length - 1;
    setSearchIndex(newIdx);
    setSelectedId(searchMatchIds[newIdx]);
  }, [searchMatchIds, setSearchIndex, setSelectedId]);

  // Auto-select first match when search query changes
  useEffect(() => {
    if (!searchQuery) {
      setSearchIndex(null);
      return;
    }
    if (searchMatchIds.length > 0) {
      setSearchIndex(0);
      setSelectedId(searchMatchIds[0]);
    } else {
      setSearchIndex(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Sync searchIndex when selectedId changes via arrow keys or click
  useEffect(() => {
    if (!searchQuery || searchMatchIds.length === 0 || selectedId === null) return;
    const idx = searchMatchIds.indexOf(selectedId);
    if (idx !== -1 && idx !== searchIndexRef.current) {
      setSearchIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Read latest values from refs to avoid stale closure
      const selectedId = selectedIdRef.current;
      const selectedIds = selectedIdsRef.current;

      // Don't handle keys when modal is open
      if (modal) return;

      // ? key: show shortcuts help
      if (e.key === "?" && !e.ctrlKey && !e.altKey && editingId === null) {
        e.preventDefault();
        setModal("shortcuts");
        return;
      }

      // Undo/Redo works even during editing
      const key = e.key.toLowerCase();
      if (key === "z" && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((key === "y" && e.ctrlKey) || (key === "z" && e.ctrlKey && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+C: copy node(s)
      if (key === "c" && e.ctrlKey && selectedId !== null) {
        e.preventDefault();
        if (selectedIds.size > 0) {
          clipboardRef.current = copyNodes(nodes, selectedIds);
        } else {
          const copied = copyNode(nodes, selectedId);
          clipboardRef.current = copied ? [copied] : [];
        }
        setHasTreeClipboard(clipboardRef.current.length > 0);
        if (clipboardRef.current.length > 0) {
          setClipboardMsg(`Copied ${clipboardRef.current.length} node(s)`);
          if (clipboardMsgTimer.current) clearTimeout(clipboardMsgTimer.current);
          clipboardMsgTimer.current = setTimeout(() => setClipboardMsg(null), 2000);
        }
        return;
      }

      // Ctrl+X: cut node(s)
      if (key === "x" && e.ctrlKey && selectedId !== null) {
        e.preventDefault();
        const showCutMsg = (count: number) => {
          setClipboardMsg(`Cut ${count} node(s)`);
          if (clipboardMsgTimer.current) clearTimeout(clipboardMsgTimer.current);
          clipboardMsgTimer.current = setTimeout(() => setClipboardMsg(null), 2000);
        };
        if (selectedIds.size > 0) {
          clipboardRef.current = copyNodes(nodes, selectedIds);
          setHasTreeClipboard(true);
          showCutMsg(clipboardRef.current.length);
          const visible = flattenVisible(displayNodes);
          const currentIndex = visible.findIndex((n) => n.id === selectedId);
          const newNodes = deleteNodes(nodes, selectedIds);
          update(newNodes);
          setSelectedIdsWrapped(new Set());
          selectionAnchorRef.current = null;
          const newVisible = flattenVisible(
            searchQuery ? filterTree(newNodes, searchQuery) : newNodes
          );
          if (newVisible.length === 0) {
            setSelectedId(null);
          } else if (currentIndex < newVisible.length) {
            setSelectedId(newVisible[currentIndex].id);
          } else {
            setSelectedId(newVisible[newVisible.length - 1].id);
          }
        } else {
          const copied = copyNode(nodes, selectedId);
          if (copied) {
            clipboardRef.current = [copied];
            setHasTreeClipboard(true);
            showCutMsg(1);
            const visible = flattenVisible(displayNodes);
            const currentIndex = visible.findIndex((n) => n.id === selectedId);
            const newNodes = deleteNode(nodes, selectedId);
            update(newNodes);
            const newVisible = flattenVisible(
              searchQuery ? filterTree(newNodes, searchQuery) : newNodes
            );
            if (newVisible.length === 0) {
              setSelectedId(null);
            } else if (currentIndex < newVisible.length) {
              setSelectedId(newVisible[currentIndex].id);
            } else {
              setSelectedId(newVisible[newVisible.length - 1].id);
            }
          }
        }
        return;
      }

      // Ctrl+V: paste node(s)
      if (key === "v" && e.ctrlKey && selectedId !== null && clipboardRef.current.length > 0) {
        e.preventDefault();
        const startId = nextId(nodes);
        const newNodes = pasteNodes(nodes, selectedId, clipboardRef.current, startId);
        update(newNodes);
        // Select last pasted node
        const visible = flattenVisible(
          searchQuery ? filterTree(newNodes, searchQuery) : newNodes
        );
        const targetIndex = visible.findIndex((n) => n.id === selectedId);
        if (targetIndex !== -1 && targetIndex + clipboardRef.current.length < visible.length) {
          setSelectedId(visible[targetIndex + clipboardRef.current.length].id);
        }
        setClipboardMsg(`Pasted ${clipboardRef.current.length} node(s)`);
        if (clipboardMsgTimer.current) clearTimeout(clipboardMsgTimer.current);
        clipboardMsgTimer.current = setTimeout(() => setClipboardMsg(null), 2000);
        return;
      }

      // Ctrl+F: focus search
      if (key === "f" && e.ctrlKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Ctrl+Delete: delete current node (works even while editing)
      if (e.key === "Delete" && e.ctrlKey && selectedId !== null) {
        e.preventDefault();
        setEditingId(null);
        const visibleNow = flattenVisible(displayNodes);
        const currentIndex = visibleNow.findIndex((n) => n.id === selectedId);
        const ctx = findParentContext(nodes, selectedId);
        const isLastChild = ctx && ctx.index === ctx.siblings.length - 1;
        const newNodes = selectedIds.size > 0
          ? deleteNodes(nodes, selectedIds)
          : deleteNode(nodes, selectedId);
        update(newNodes);
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        const newVisible = flattenVisible(
          searchQuery ? filterTree(newNodes, searchQuery) : newNodes
        );
        if (newVisible.length === 0) {
          setSelectedId(null);
        } else if (!isLastChild && currentIndex < newVisible.length) {
          // Not last child: move to next node (same index after deletion)
          startEdit(newVisible[currentIndex].id, 0);
        } else if (currentIndex > 0) {
          // Last child: move to previous node
          const prevIndex = Math.min(currentIndex - 1, newVisible.length - 1);
          startEdit(newVisible[prevIndex].id, newVisible[prevIndex].text.length);
        } else {
          startEdit(newVisible[0].id, 0);
        }
        return;
      }

      // Ctrl+Enter: add child node (works even while editing)
      if (e.key === "Enter" && e.ctrlKey && selectedId !== null) {
        e.preventDefault();
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        const newId = nextId(nodes);
        const { tree } = addChildNode(nodes, selectedId, newId);
        update(tree);
        addOriginRef.current = selectedId;
        startEdit(newId, 0);
        setEditText("");
        return;
      }

      // Don't handle other keys while editing (input handles its own keys)
      // Arrow up/down pass through after confirm (editingIdRef is already cleared)
      if (editingIdRef.current !== null) return;

      // F3 / Ctrl+G: next search match
      if ((e.key === "F3" && !e.shiftKey) || (key === "g" && e.ctrlKey && !e.shiftKey)) {
        if (searchQuery && searchMatchIds.length > 0) {
          e.preventDefault();
          navigateSearch(1);
          return;
        }
      }

      // Shift+F3 / Ctrl+Shift+G: previous search match
      if ((e.key === "F3" && e.shiftKey) || (key === "g" && e.ctrlKey && e.shiftKey)) {
        if (searchQuery && searchMatchIds.length > 0) {
          e.preventDefault();
          navigateSearch(-1);
          return;
        }
      }

      const visible = flattenVisible(displayNodes);
      if (visible.length === 0) return;

      // Escape: clear search first, then deselect
      if (e.key === "Escape") {
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        if (searchQuery) {
          setSearchQuery("");
        } else {
          setSelectedId(null);
        }
        return;
      }

      // F2 or Space: edit selected node
      if ((e.key === "F2" || e.key === " ") && selectedId !== null) {
        e.preventDefault();
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        startEdit(selectedId);
        return;
      }

      // Home: select first visible node
      if (e.key === "Home" && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        skipScrollRef.current = true;
        const newId = visible[0].id;
        setSelectedId(newId);
        const el = document.querySelector(`[data-node-id="${newId}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top < 0 || rect.bottom > window.innerHeight) {
            window.scrollBy(0, rect.top);
          }
        }
        return;
      }

      // End: select last visible node
      if (e.key === "End" && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        skipScrollRef.current = true;
        const newId = visible[visible.length - 1].id;
        setSelectedId(newId);
        const el = document.querySelector(`[data-node-id="${newId}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top < 0 || rect.bottom > window.innerHeight) {
            window.scrollBy(0, rect.bottom - window.innerHeight);
          }
        }
        return;
      }

      // Page Up / Page Down: move selection by one page
      if (e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault();
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;

        if (selectedId === null) {
          setSelectedId(visible[0].id);
          return;
        }

        const currentIndex = visible.findIndex((n) => n.id === selectedId);
        if (currentIndex === -1) {
          setSelectedId(visible[0].id);
          return;
        }

        // Remember current selection's screen Y position
        const currentEl = document.querySelector(`[data-node-id="${selectedId}"]`);
        const oldTop = currentEl ? currentEl.getBoundingClientRect().top : 0;

        // Calculate page size from viewport height and node row height
        const nodeEl = document.querySelector(`[data-node-id]`);
        const rowHeight = nodeEl ? nodeEl.getBoundingClientRect().height : 32;
        const pageSize = Math.max(1, Math.floor(window.innerHeight / rowHeight) - 1);

        let newIndex: number;
        if (e.key === "PageUp") {
          newIndex = Math.max(0, currentIndex - pageSize);
        } else {
          newIndex = Math.min(visible.length - 1, currentIndex + pageSize);
        }

        skipScrollRef.current = true;
        const newId = visible[newIndex].id;
        setSelectedId(newId);

        // Scroll by exact difference so new selection appears at same screen position
        const newEl = document.querySelector(`[data-node-id="${newId}"]`);
        if (newEl) {
          const newTop = newEl.getBoundingClientRect().top;
          window.scrollBy(0, newTop - oldTop);
        }
        return;
      }

      // Shift+Enter: add sibling before
      if (e.key === "Enter" && e.shiftKey && selectedId !== null) {
        e.preventDefault();
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        const newId = nextId(nodes);
        const result = addSiblingBefore(nodes, selectedId, newId);
        if (result) {
          update(result.tree);
          addOriginRef.current = selectedId;
          setSelectedId(newId);
          if (editOnAdd) { setEditingId(newId); setEditText(""); }
        }
        return;
      }

      // Enter: add sibling node
      if (e.key === "Enter" && selectedId !== null) {
        e.preventDefault();
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        const newId = nextId(nodes);
        const result = addSiblingNode(nodes, selectedId, newId);
        if (result) {
          update(result.tree);
          addOriginRef.current = selectedId;
          setSelectedId(newId);
          if (editOnAdd) { setEditingId(newId); setEditText(""); }
        }
        return;
      }

      // Shift+Tab: add child node at beginning
      if (e.key === "Tab" && e.shiftKey && selectedId !== null) {
        e.preventDefault();
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        const newId = nextId(nodes);
        const { tree } = addChildNodeFirst(nodes, selectedId, newId);
        update(tree);
        addOriginRef.current = selectedId;
        setSelectedId(newId);
        if (editOnAdd) { setEditingId(newId); setEditText(""); }
        return;
      }

      // Tab: add child node
      if (e.key === "Tab" && selectedId !== null) {
        e.preventDefault();
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        const newId = nextId(nodes);
        const { tree } = addChildNode(nodes, selectedId, newId);
        update(tree);
        addOriginRef.current = selectedId;
        setSelectedId(newId);
        if (editOnAdd) { setEditingId(newId); setEditText(""); }
        return;
      }

      // Delete: delete selected node(s) (non-editing only; Ctrl+Delete handled above)
      if (e.key === "Delete" && !e.ctrlKey && selectedId !== null) {
        e.preventDefault();
        const currentIndex = visible.findIndex((n) => n.id === selectedId);
        const newNodes = selectedIds.size > 0
          ? deleteNodes(nodes, selectedIds)
          : deleteNode(nodes, selectedId);
        update(newNodes);
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        const newVisible = flattenVisible(
          searchQuery ? filterTree(newNodes, searchQuery) : newNodes
        );
        if (newVisible.length === 0) {
          setSelectedId(null);
        } else if (currentIndex < newVisible.length) {
          setSelectedId(newVisible[currentIndex].id);
        } else {
          setSelectedId(newVisible[newVisible.length - 1].id);
        }
        return;
      }

      // Ctrl+Shift+L: toggle OL
      if (key === "l" && e.ctrlKey && e.shiftKey && selectedId !== null) {
        e.preventDefault();
        const newNodes = toggleOl(nodes, selectedId);
        update(newNodes);
        return;
      }

      // Alt+Arrow: move node up among siblings
      if (e.key === "ArrowUp" && e.altKey && selectedId !== null) {
        e.preventDefault();
        const result = moveNodeUp(nodes, selectedId);
        if (result) update(result);
        return;
      }

      // Alt+Arrow: move node down among siblings
      if (e.key === "ArrowDown" && e.altKey && selectedId !== null) {
        e.preventDefault();
        const result = moveNodeDown(nodes, selectedId);
        if (result) update(result);
        return;
      }

      // Alt+Arrow: indent
      if (e.key === "ArrowRight" && e.altKey && selectedId !== null) {
        e.preventDefault();
        const result = indentNode(nodes, selectedId);
        if (result) update(result);
        return;
      }

      // Alt+Arrow: outdent
      if (e.key === "ArrowLeft" && e.altKey && selectedId !== null) {
        e.preventDefault();
        const result = outdentNode(nodes, selectedId);
        if (result) update(result);
        return;
      }

      // Arrow Right: expand or move to first child
      if (e.key === "ArrowRight" && selectedId !== null) {
        e.preventDefault();
        const node = findNode(nodes, selectedId);
        if (!node || node.children.length === 0) return;
        if (node.closed) {
          const newNodes = setNodeClosed(nodes, selectedId, false);
          update(newNodes);
        } else {
          setSelectedId(node.children[0].id);
        }
        return;
      }

      // Arrow Left: collapse or move to parent
      if (e.key === "ArrowLeft" && selectedId !== null) {
        e.preventDefault();
        const node = findNode(nodes, selectedId);
        if (node && !node.closed && node.children.length > 0) {
          const newNodes = setNodeClosed(nodes, selectedId, true);
          update(newNodes);
        } else {
          const ctx = findParentContext(nodes, selectedId);
          if (ctx?.parent) {
            setSelectedId(ctx.parent.id);
          }
        }
        return;
      }

      // Ctrl+Arrow Up/Down: scroll view without changing selection
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const nodeEl = selectedId !== null
          ? document.querySelector(`[data-node-id="${selectedId}"]`)
          : null;
        const scrollAmount = nodeEl ? nodeEl.getBoundingClientRect().height : 16;
        window.scrollBy(0, e.key === "ArrowDown" ? scrollAmount : -scrollAmount);
        return;
      }

      // Arrow Up/Down: move selection (with optional Shift for range select)
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();

        if (selectedId === null) {
          setSelectedId(visible[0].id);
          return;
        }

        const currentIndex = visible.findIndex((n) => n.id === selectedId);
        if (currentIndex === -1) {
          setSelectedId(visible[0].id);
          return;
        }

        // Skip useLayoutEffect's scrollIntoView — we handle scroll manually here.
        skipScrollRef.current = true;

        // Calculate new index
        let newIndex = currentIndex;
        if (e.key === "ArrowUp" && currentIndex > 0) {
          newIndex = currentIndex - 1;
        } else if (e.key === "ArrowDown" && currentIndex < visible.length - 1) {
          newIndex = currentIndex + 1;
        }

        if (newIndex !== currentIndex) {
          const newId = visible[newIndex].id;

          if (e.shiftKey) {
            // Shift+Arrow: range selection among siblings
            if (selectionAnchorRef.current === null) {
              selectionAnchorRef.current = selectedId;
            }
            const anchorId = selectionAnchorRef.current;

            // Check if anchor and new selection are siblings — if not, stop
            const range = getSiblingRange(nodes, anchorId, newId);
            if (range) {
              setSelectedId(newId);
              setSelectedIdsWrapped(new Set(range));
            }
          } else {
            // Normal arrow: clear multi-selection
            setSelectedIdsWrapped(new Set());
            selectionAnchorRef.current = null;
            setSelectedId(newId);
            startEdit(newId, 0);
          }

          // Scroll new selection into view
          const el = document.querySelector(`[data-node-id="${newId}"]`);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top < 0) {
              window.scrollBy(0, rect.top);
            } else if (rect.bottom > window.innerHeight) {
              window.scrollBy(0, rect.bottom - window.innerHeight);
            }
          }
        } else {
          // At boundary — just scroll a bit
          if (!e.shiftKey) {
            setSelectedIdsWrapped(new Set());
            selectionAnchorRef.current = null;
          }
          const nodeEl = document.querySelector(`[data-node-id="${selectedId}"]`);
          if (nodeEl) {
            const scrollDir = e.key === "ArrowUp" ? -1 : 1;
            window.scrollBy(0, scrollDir * nodeEl.getBoundingClientRect().height);
          }
        }
      }
    },
    [nodes, editingId, editOnAdd, startEdit, update, undo, redo, searchQuery, displayNodes, modal, setSelectedId, navigateSearch, searchMatchIds]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected node into view.
  // Skip when ArrowUp/Down already handled scrolling directly,
  // to prevent useLayoutEffect's scrollIntoView from undoing manual scrollBy.
  useLayoutEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    if (selectedId !== null) {
      const el = document.querySelector(`[data-node-id="${selectedId}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId]);

  const handleToggle = useCallback(
    (id: number) => {
      const newNodes = toggleNode(nodes, id);
      update(newNodes);
    },
    [nodes, update]
  );

  const handleSelect = useCallback(
    (id: number) => {
      setSelectedIdsWrapped(new Set());
      selectionAnchorRef.current = null;
      setSelectedId(id);
      startEdit(id);
    },
    [setSelectedId, startEdit]
  );

  const handleDrop = useCallback(
    (srcId: number, targetId: number, position: "before" | "after" | "child", indent?: number) => {
      const result = moveNode(nodes, srcId, targetId, position, indent);
      if (result) {
        update(result);
        setSelectedId(srcId);
      }
      setDragId(null);
    },
    [nodes, update, setSelectedId]
  );

  const handleDragEnd = useCallback(() => {
    setDragId(null);
  }, []);

  // Export handler
  const handleExport = useCallback(() => {
    const text = treeToText(nodes);
    setModalText(text);
    setModal("export");
  }, [nodes]);

  // Markdown export handler
  const handleMarkdown = useCallback(() => {
    if (selectedId === null) return;
    const node = findNode(nodes, selectedId);
    if (!node) return;
    const md = treeToMarkdown(node);
    setModalText(md);
    setModal("markdown");
  }, [nodes, selectedId]);

  // Import handler
  const handleImport = useCallback(() => {
    setModalText("");
    setModal("import");
  }, []);

  const handleImportConfirm = useCallback(() => {
    if (!modalText.trim()) {
      setModal(null);
      return;
    }
    const startIdVal = nextId(nodes);
    const { nodes: imported } = textToTree(modalText, startIdVal);
    if (imported.length > 0) {
      const newNodes = [...nodes, ...imported];
      update(newNodes);
    }
    setModal(null);
    setModalText("");
  }, [modalText, nodes, update]);

  // MD Import handler
  const handleImportMd = useCallback(() => {
    setModalText("");
    setModal("import-md");
  }, []);

  const handleImportMdConfirm = useCallback(() => {
    if (!modalText.trim() || selectedId === null) {
      setModal(null);
      return;
    }
    const parent = findNode(nodes, selectedId);
    if (!parent) {
      setModal(null);
      return;
    }
    const startIdVal = nextId(nodes);
    const { nodes: imported } = markdownToTree(modalText, startIdVal, parent.indent + 1);
    if (imported.length > 0) {
      const newNodes = JSON.parse(JSON.stringify(nodes)) as TreeNodeData[];
      const targetParent = findNode(newNodes, selectedId);
      if (targetParent) {
        targetParent.closed = false;
        targetParent.children.push(...imported);
        update(newNodes);
      }
    }
    setModal(null);
    setModalText("");
  }, [modalText, nodes, selectedId, update]);

  // Restore from backup
  const handleLoadBackups = useCallback(() => {
    fetch("/api/tree/restore")
      .then((res) => res.json())
      .then((data) => {
        if (data.backups) {
          setBackups(data.backups);
          setShowBackups(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleRestore = useCallback(
    (backupName: string) => {
      if (!confirm("Restore from this backup? Current data will be overwritten.")) return;
      fetch("/api/tree/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup: backupName }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.nodes) {
            update(data.nodes);
            setShowBackups(false);
          }
        })
        .catch(() => {});
    },
    [update]
  );

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl py-4">
        <div className="flex items-center justify-between px-4 pb-3">
          <h1 className="text-lg font-semibold">Locus</h1>
          <div className="flex items-center gap-3">
            {clipboardMsg && (
              <span className="text-xs text-green-500">{clipboardMsg}</span>
            )}
            {saveStatus !== "idle" && (
              <span
                className={`text-xs ${
                  saveStatus === "saving"
                    ? "text-zinc-400"
                    : saveStatus === "saved"
                      ? "text-green-500"
                      : "text-red-500"
                }`}
              >
                {saveStatus === "saving"
                  ? "Saving..."
                  : saveStatus === "saved"
                    ? "Saved"
                    : "Save failed"}
              </span>
            )}
            <div className="flex items-center gap-1">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search (Ctrl+F)"
                className="w-48 rounded border border-zinc-300 bg-white px-2 py-1 text-xs outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchQuery("");
                    searchInputRef.current?.blur();
                    e.stopPropagation();
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    navigateSearch(e.shiftKey ? -1 : 1);
                  }
                }}
              />
              {searchQuery && (
                <span className="text-xs text-zinc-400 whitespace-nowrap">
                  {searchHitCount > 0 && searchIndex !== null
                    ? `${searchIndex + 1} / ${searchHitCount}`
                    : `0 / 0`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 pb-2 text-xs">
          <button
            className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={handleImport}
            title="Import from indented text"
          >
            Import
          </button>
          <button
            className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={handleExport}
            title="Export as indented text"
          >
            Export
          </button>
          <button
            className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 disabled:opacity-40"
            onClick={handleImportMd}
            disabled={selectedId === null}
            title="Import Markdown as children of selected node"
          >
            MD Import
          </button>
          <button
            className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 disabled:opacity-40"
            onClick={handleMarkdown}
            disabled={selectedId === null}
            title="Export selected node as Markdown"
          >
            MD Export
          </button>
          <button
            className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={handleLoadBackups}
            title="Restore from backup"
          >
            Restore
          </button>
          <button
            className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => setModal("shortcuts")}
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
          <button
            className="w-7 rounded border border-zinc-300 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800 text-center"
            onClick={toggleTheme}
            title={`Theme: ${theme}`}
          >
            {theme === "dark" ? "\u263D" : "\u2600"}
          </button>
          <label className="ml-2 flex items-center gap-1 cursor-pointer select-none" title="Toggle edit mode on add (Enter/Tab)">
            <input
              type="checkbox"
              checked={editOnAdd}
              onChange={(e) => setEditOnAdd(e.target.checked)}
              className="cursor-pointer"
            />
            Edit on add
          </label>
          <span className="ml-auto text-zinc-400" title="Total node count">
            {nodeCount.toLocaleString()} nodes
          </span>
        </div>

        {/* Backup list */}
        {showBackups && (
          <div className="mx-4 mb-2 rounded border border-zinc-300 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">Backups</span>
              <button
                className="text-zinc-400 hover:text-zinc-600"
                onClick={() => setShowBackups(false)}
              >
                Close
              </button>
            </div>
            {backups.length === 0 ? (
              <p className="text-zinc-400">No backups available</p>
            ) : (
              <ul className="space-y-0.5">
                {backups.map((b, idx) => (
                  <li key={b.name} className="flex items-center gap-2">
                    <button
                      className="text-blue-500 hover:underline"
                      onClick={() => handleRestore(b.name)}
                    >
                      {idx === 0 ? "Latest" : `#${idx + 1}`}
                    </button>
                    <span className="text-zinc-400">
                      {new Date(b.mtime).toLocaleString("en-US")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div style={{ fontFamily: "'ＭＳ Ｐゴシック', 'MS PGothic', Osaka, sans-serif", fontSize: "12px", letterSpacing: "1px" }}>
          {displayNodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              selectedId={selectedId}
              selectedIds={selectedIds}
              editingId={editingId}
              editText={editText}
              dragId={dragId}
              searchQuery={searchQuery}
              cursorPosition={cursorPositionRef.current}
              editTrigger={editTrigger}
              onSelect={handleSelect}
              onToggle={handleToggle}
              onStartEdit={startEdit}
              onEditTextChange={setEditText}
              onEditConfirm={confirmEdit}
              onEditCancel={cancelEdit}
              onEditSplit={splitEdit}
              onMergeWithPrevious={mergeWithPrevious}
              onMergeWithNext={mergeWithNext}
              onIndent={indentEditing}
              onOutdent={outdentEditing}
              onDeselect={deselectNode}
              onMoveToPreviousEnd={moveToPreviousEnd}
              onMoveToNextStart={moveToNextStart}
              onShiftBoundary={shiftBoundary}
              onTreeCopy={treeCopy}
              onTreeCut={treeCut}
              onTreePaste={hasTreeClipboard ? treePaste : null}
              onTextCopied={textCopied}
              onDragStart={setDragId}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
          <div style={{ height: "80vh" }} />
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[600px] max-h-[80vh] rounded-lg bg-white p-4 shadow-xl dark:bg-zinc-900 overflow-y-auto">
            {modal === "shortcuts" ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
                  <button
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    onClick={() => setModal(null)}
                  >
                    Close
                  </button>
                </div>
                {([
                  ["Navigation", [
                    ["\u2191 / \u2193", "Move selection"],
                    ["Shift+\u2191 / \u2193", "Range select siblings"],
                    ["\u2192", "Expand / move to first child"],
                    ["\u2190", "Collapse / move to parent"],
                    ["Home", "Jump to first node"],
                    ["End", "Jump to last node"],
                    ["PageUp / PageDown", "Move by page"],
                    ["Ctrl+\u2191 / \u2193", "Scroll without moving"],
                    ["Ctrl+F", "Search"],
                    ["Enter / Shift+Enter", "Next/prev match (in search)"],
                    ["F3 / Shift+F3", "Next/prev match"],
                  ]],
                  ["Editing", [
                    ["Enter", "Split node at cursor"],
                    ["Ctrl+Enter", "Add child node"],
                    ["Escape", "Confirm + deselect"],
                    ["Backspace", "Merge with previous (at start)"],
                    ["Delete", "Merge with next (at end)"],
                    ["Ctrl+Delete", "Delete node"],
                    ["Tab / Shift+Tab", "Indent / Outdent"],
                  ]],
                  ["Structure", [
                    ["Enter", "Add sibling after (no selection)"],
                    ["Delete", "Delete node(s) (no editing)"],
                    ["Alt+\u2191 / \u2193", "Move node up/down"],
                    ["Alt+\u2192 / \u2190", "Indent / Outdent"],
                  ]],
                  ["Clipboard", [
                    ["Ctrl+C", "Copy"],
                    ["Ctrl+X", "Cut"],
                    ["Ctrl+V", "Paste"],
                  ]],
                  ["Other", [
                    ["Ctrl+Z", "Undo"],
                    ["Ctrl+Y", "Redo"],
                    ["Ctrl+Shift+L", "Toggle OL"],
                    ["?", "Show shortcuts"],
                  ]],
                ] as [string, [string, string][]][]).map(([category, shortcuts]) => (
                  <div key={category} className="mb-3">
                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">{category}</h3>
                    <div className="grid grid-cols-[140px_1fr] gap-y-0.5 text-xs">
                      {shortcuts.map(([key, desc]) => (
                        <div key={key} className="contents">
                          <kbd className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300">{key}</kbd>
                          <span className="text-zinc-700 dark:text-zinc-300">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <h2 className="mb-2 text-sm font-semibold">
                  {modal === "import" ? "Import" : modal === "export" ? "Export" : modal === "import-md" ? "MD Import" : "Markdown"}
                </h2>
                <textarea
                  className="w-full h-64 rounded border border-zinc-300 bg-zinc-50 p-2 text-xs font-mono outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800"
                  value={modalText}
                  onChange={(e) => setModalText(e.target.value)}
                  readOnly={modal !== "import" && modal !== "import-md"}
                  placeholder={modal === "import-md" ? "Paste Markdown here...\n\n# Heading\n- Item 1\n  - Sub item\n- Item 2" : undefined}
                  autoFocus
                />
                <div className="mt-2 flex justify-end gap-2">
                  {modal === "import" && (
                    <button
                      className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600"
                      onClick={handleImportConfirm}
                    >
                      Import
                    </button>
                  )}
                  {modal === "import-md" && (
                    <button
                      className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600"
                      onClick={handleImportMdConfirm}
                    >
                      Import
                    </button>
                  )}
                  {(modal === "export" || modal === "markdown") && (
                    <button
                      className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600"
                      onClick={() => {
                        navigator.clipboard.writeText(modalText);
                      }}
                    >
                      Copy
                    </button>
                  )}
                  <button
                    className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    onClick={() => {
                      setModal(null);
                      setModalText("");
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
