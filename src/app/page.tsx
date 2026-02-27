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
  pasteNode,
  moveNode,
  countAllNodes,
  treeToText,
  textToTree,
  treeToMarkdown,
  markdownToTree,
  toggleOl,
  getSiblingRange,
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const clipboardRef = useRef<TreeNodeData | null>(null);
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
    saveTree(prev.nodes);
    prevCountRef.current = countAllNodes(prev.nodes);
  }, [saveTree, setSelectedId]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({ nodes: nodesRef.current, selectedId: selectedIdRef.current });
    nodesRef.current = next.nodes;
    setNodes(next.nodes);
    setSelectedId(next.selectedId);
    saveTree(next.nodes);
    prevCountRef.current = countAllNodes(next.nodes);
  }, [saveTree, setSelectedId]);

  const startEdit = useCallback(
    (id: number) => {
      const node = findNode(nodes, id);
      if (node) {
        setEditingId(id);
        setEditText(node.text);
      }
    },
    [nodes]
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

  const displayNodes = searchQuery ? filterTree(nodes, searchQuery) : nodes;

  const nodeCount = useMemo(() => countAllNodes(nodes), [nodes]);

  // Count search hits
  const searchHitCount = useMemo(() => {
    if (!searchQuery) return 0;
    const lowerQuery = searchQuery.toLowerCase();
    let count = 0;
    function walk(list: TreeNodeData[]) {
      for (const node of list) {
        if (node.text.toLowerCase().includes(lowerQuery)) count++;
        walk(node.children);
      }
    }
    walk(nodes);
    return count;
  }, [nodes, searchQuery]);

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

      // Ctrl+C: copy node
      if (key === "c" && e.ctrlKey && selectedId !== null) {
        e.preventDefault();
        const copied = copyNode(nodes, selectedId);
        if (copied) clipboardRef.current = copied;
        return;
      }

      // Ctrl+X: cut node
      if (key === "x" && e.ctrlKey && selectedId !== null) {
        e.preventDefault();
        const copied = copyNode(nodes, selectedId);
        if (copied) {
          clipboardRef.current = copied;
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
        return;
      }

      // Ctrl+V: paste node
      if (key === "v" && e.ctrlKey && selectedId !== null && clipboardRef.current) {
        e.preventDefault();
        const newId = nextId(nodes);
        const newNodes = pasteNode(nodes, selectedId, clipboardRef.current, newId);
        update(newNodes);
        setSelectedId(newId);
        return;
      }

      // Ctrl+F: focus search
      if (key === "f" && e.ctrlKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Don't handle other keys while editing (input handles its own keys)
      if (editingId !== null) return;

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

      // Delete: delete selected node(s)
      if (e.key === "Delete" && selectedId !== null) {
        e.preventDefault();
        const currentIndex = visible.findIndex((n) => n.id === selectedId);
        let newNodes: TreeNodeData[];
        if (selectedIds.size > 0) {
          newNodes = deleteNodes(nodes, selectedIds);
        } else {
          newNodes = deleteNode(nodes, selectedId);
        }
        update(newNodes);
        setSelectedIdsWrapped(new Set());
        selectionAnchorRef.current = null;
        // Select next or previous visible node
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
            setSelectedId(newId);

            // Check if anchor and new selection are siblings
            const range = getSiblingRange(nodes, anchorId, newId);
            if (range) {
              setSelectedIdsWrapped(new Set(range));
            } else {
              // Not siblings — no multi-selection, just move main selection
              setSelectedIdsWrapped(new Set());
            }
          } else {
            // Normal arrow: clear multi-selection
            setSelectedIdsWrapped(new Set());
            selectionAnchorRef.current = null;
            setSelectedId(newId);
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
    [nodes, editingId, editOnAdd, startEdit, update, undo, redo, searchQuery, displayNodes, modal, setSelectedId]
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
    },
    [setSelectedId]
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
                className="w-48 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-400 dark:border-zinc-700"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchQuery("");
                    searchInputRef.current?.blur();
                    e.stopPropagation();
                  }
                }}
              />
              {searchQuery && (
                <span className="text-xs text-zinc-400 whitespace-nowrap">
                  {searchHitCount} found
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
              onSelect={handleSelect}
              onToggle={handleToggle}
              onStartEdit={startEdit}
              onEditTextChange={setEditText}
              onEditConfirm={confirmEdit}
              onEditCancel={cancelEdit}
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
                  ]],
                  ["Editing", [
                    ["F2 / Space", "Edit node"],
                    ["Ctrl+Enter", "Confirm edit"],
                    ["Escape", "Cancel / clear"],
                  ]],
                  ["Structure", [
                    ["Enter", "Add sibling after"],
                    ["Shift+Enter", "Add sibling before"],
                    ["Tab", "Add child (end)"],
                    ["Shift+Tab", "Add child (start)"],
                    ["Delete", "Delete node(s)"],
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
