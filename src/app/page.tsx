"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import TreeNode, { TreeNodeData } from "./components/TreeNode";
import {
  flattenVisible,
  findNode,
  findParentContext,
  toggleNode,
  setNodeClosed,
  updateNodeText,
  addChildNode,
  deleteNode,
  indentNode,
  outdentNode,
  moveNodeUp,
  moveNodeDown,
  nextId,
} from "./lib/treeUtils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function Home() {
  const [nodes, setNodes] = useState<TreeNodeData[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const undoStack = useRef<TreeNodeData[][]>([]);
  const redoStack = useRef<TreeNodeData[][]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const update = useCallback(
    (newNodes: TreeNodeData[]) => {
      undoStack.current.push(nodesRef.current);
      redoStack.current = [];
      nodesRef.current = newNodes;
      setNodes(newNodes);
      saveTree(newNodes);
    },
    [saveTree]
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(nodesRef.current);
    nodesRef.current = prev;
    setNodes(prev);
    saveTree(prev);
  }, [saveTree]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(nodesRef.current);
    nodesRef.current = next;
    setNodes(next);
    saveTree(next);
  }, [saveTree]);

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
    // If editing a new empty node, delete it
    if (editingId !== null) {
      const node = findNode(nodes, editingId);
      if (node && node.text === "" && editText === "") {
        const newNodes = deleteNode(nodes, editingId);
        update(newNodes);
        setSelectedId(null);
      }
    }
    setEditingId(null);
  }, [editingId, nodes, editText, update]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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

      // Don't handle other keys while editing (input handles its own keys)
      if (editingId !== null) return;

      const visible = flattenVisible(nodes);
      if (visible.length === 0) return;

      // Escape: deselect
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }

      // F2: edit selected node
      if (e.key === "F2" && selectedId !== null) {
        e.preventDefault();
        startEdit(selectedId);
        return;
      }

      // Tab: add child node
      if (e.key === "Tab" && selectedId !== null) {
        e.preventDefault();
        const newId = nextId(nodes);
        const { tree } = addChildNode(nodes, selectedId, newId);
        update(tree);
        setSelectedId(newId);
        // Start editing the new node
        setEditingId(newId);
        setEditText("");
        return;
      }

      // Delete: delete selected node
      if (e.key === "Delete" && selectedId !== null) {
        e.preventDefault();
        const currentIndex = visible.findIndex((n) => n.id === selectedId);
        const newNodes = deleteNode(nodes, selectedId);
        update(newNodes);
        // Select next or previous visible node
        const newVisible = flattenVisible(newNodes);
        if (newVisible.length === 0) {
          setSelectedId(null);
        } else if (currentIndex < newVisible.length) {
          setSelectedId(newVisible[currentIndex].id);
        } else {
          setSelectedId(newVisible[newVisible.length - 1].id);
        }
        return;
      }

      // Alt+↑: move node up among siblings
      if (e.key === "ArrowUp" && e.altKey && selectedId !== null) {
        e.preventDefault();
        const result = moveNodeUp(nodes, selectedId);
        if (result) update(result);
        return;
      }

      // Alt+↓: move node down among siblings
      if (e.key === "ArrowDown" && e.altKey && selectedId !== null) {
        e.preventDefault();
        const result = moveNodeDown(nodes, selectedId);
        if (result) update(result);
        return;
      }

      // Alt+→: indent
      if (e.key === "ArrowRight" && e.altKey && selectedId !== null) {
        e.preventDefault();
        const result = indentNode(nodes, selectedId);
        if (result) update(result);
        return;
      }

      // Alt+←: outdent
      if (e.key === "ArrowLeft" && e.altKey && selectedId !== null) {
        e.preventDefault();
        const result = outdentNode(nodes, selectedId);
        if (result) update(result);
        return;
      }

      // →: expand or move to first child
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

      // ←: collapse or move to parent
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

      // ↑/↓: move selection
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

        if (e.key === "ArrowUp" && currentIndex > 0) {
          setSelectedId(visible[currentIndex - 1].id);
        } else if (e.key === "ArrowDown" && currentIndex < visible.length - 1) {
          setSelectedId(visible[currentIndex + 1].id);
        }
      }
    },
    [nodes, selectedId, editingId, startEdit, update, undo, redo]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected node into view
  useEffect(() => {
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

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl py-4">
        <div className="flex items-center justify-between px-4 pb-3">
          <h1 className="text-lg font-semibold">Locus</h1>
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
                ? "保存中..."
                : saveStatus === "saved"
                  ? "保存済み"
                  : "保存失敗"}
            </span>
          )}
        </div>
        <div className="text-sm font-mono">
          {nodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              selectedId={selectedId}
              editingId={editingId}
              editText={editText}
              onSelect={setSelectedId}
              onToggle={handleToggle}
              onEditTextChange={setEditText}
              onEditConfirm={confirmEdit}
              onEditCancel={cancelEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
