"use client";

import { useEffect, useState, useCallback } from "react";
import TreeNode, { TreeNodeData } from "./components/TreeNode";

/** Flatten visible nodes (skip children of closed nodes) for keyboard navigation */
function flattenVisible(nodes: TreeNodeData[]): TreeNodeData[] {
  const result: TreeNodeData[] = [];
  for (const node of nodes) {
    result.push(node);
    if (!node.closed) {
      result.push(...flattenVisible(node.children));
    }
  }
  return result;
}

export default function Home() {
  const [nodes, setNodes] = useState<TreeNodeData[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tree")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setNodes(data.nodes);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }

      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      e.preventDefault();
      const visible = flattenVisible(nodes);
      if (visible.length === 0) return;

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
    },
    [nodes, selectedId]
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
        <h1 className="px-4 pb-3 text-lg font-semibold">Locus CMS</h1>
        <div className="text-sm font-mono">
          {nodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
