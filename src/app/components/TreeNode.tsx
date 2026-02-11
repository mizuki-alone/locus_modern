"use client";

import { useRef, useEffect, useState, useCallback } from "react";

export interface TreeNodeData {
  id: number;
  text: string;
  indent: number;
  closed: boolean;
  children: TreeNodeData[];
}

type DropPosition = "before" | "after" | "child" | null;

interface TreeNodeProps {
  node: TreeNodeData;
  selectedId: number | null;
  editingId: number | null;
  editText: string;
  dragId: number | null;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onEditTextChange: (text: string) => void;
  onEditConfirm: () => void;
  onEditCancel: () => void;
  onDragStart: (id: number) => void;
  onDrop: (dragId: number, targetId: number, position: "before" | "after" | "child", indent?: number) => void;
  onDragEnd: () => void;
}

export default function TreeNode({
  node,
  selectedId,
  editingId,
  editText,
  dragId,
  onSelect,
  onToggle,
  onEditTextChange,
  onEditConfirm,
  onEditCancel,
  onDragStart,
  onDrop,
  onDragEnd,
}: TreeNodeProps) {
  const isSelected = selectedId === node.id;
  const isEditing = editingId === node.id;
  const isDragging = dragId === node.id;
  const hasChildren = node.children.length > 0;
  const hasMultiline = node.text.includes("\n");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);
  const [dropIndent, setDropIndent] = useState<number>(1);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      autoResize(textareaRef.current);
    }
  }, [isEditing]);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (dragId === null || dragId === node.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const y = e.clientY - rect.top;
      const ratio = y / rect.height;

      if (ratio < 0.25) {
        setDropPosition("before");
        setDropIndent(node.indent);
      } else if (ratio > 0.75) {
        // After zone: X position determines indent level
        const relativeX = e.clientX - rect.left;
        const rawIndent = Math.max(1, Math.ceil(relativeX / 20));
        setDropIndent(Math.max(1, Math.min(rawIndent, node.indent)));
        setDropPosition("after");
      } else {
        setDropPosition("child");
        setDropIndent(node.indent + 1);
      }
    },
    [dragId, node.id, node.indent]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragId === null || dragId === node.id || !dropPosition) return;
      if (dropPosition === "child") {
        onDrop(dragId, node.id, "child");
      } else {
        onDrop(dragId, node.id, dropPosition, dropIndent);
      }
      setDropPosition(null);
    },
    [dragId, node.id, dropPosition, dropIndent, onDrop]
  );

  const handleDragLeave = useCallback(() => {
    setDropPosition(null);
  }, []);

  return (
    <div>
      <div
        ref={rowRef}
        className={`flex items-start cursor-pointer select-none py-0.5 px-2 rounded relative ${
          isDragging
            ? "opacity-40"
            : isSelected
              ? "bg-blue-600 text-white"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
        } ${dropPosition === "child" ? "ring-2 ring-blue-400" : ""}`}
        style={{ paddingLeft: `${(node.indent - 1) * 20 + 8}px` }}
        onClick={() => onSelect(node.id)}
        data-node-id={node.id}
        draggable={!isEditing}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart(node.id);
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
        onDragEnd={onDragEnd}
      >
        {dropPosition === "before" && (
          <div
            className="absolute right-0 top-0 h-0.5 bg-blue-500 -translate-y-1/2"
            style={{ left: `${(dropIndent - 1) * 20 + 8}px` }}
          />
        )}
        {dropPosition === "after" && (
          <div
            className="absolute right-0 bottom-0 h-0.5 bg-blue-500 translate-y-1/2"
            style={{ left: `${(dropIndent - 1) * 20 + 8}px` }}
          />
        )}

        {hasChildren ? (
          <span
            className={`mr-1 mt-0.5 w-4 shrink-0 text-center text-xs ${
              isSelected && !isDragging ? "text-blue-200" : "text-zinc-400"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            {node.closed ? "▶" : "▼"}
          </span>
        ) : (
          <span className={`mr-1 mt-0.5 w-4 shrink-0 text-center text-xs ${
            isSelected && !isDragging ? "text-blue-200" : "text-zinc-300 dark:text-zinc-600"
          }`}>•</span>
        )}

        {isEditing ? (
          <textarea
            ref={textareaRef}
            rows={1}
            className="flex-1 bg-white text-zinc-900 px-1 rounded outline-none border border-blue-400 resize-none overflow-hidden leading-snug"
            value={editText}
            onChange={(e) => {
              onEditTextChange(e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                onEditConfirm();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onEditCancel();
              }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={hasMultiline ? "whitespace-pre-wrap" : "truncate"}>
            {node.text || "(empty)"}
          </span>
        )}
      </div>

      {!node.closed &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            selectedId={selectedId}
            editingId={editingId}
            editText={editText}
            dragId={dragId}
            onSelect={onSelect}
            onToggle={onToggle}
            onEditTextChange={onEditTextChange}
            onEditConfirm={onEditConfirm}
            onEditCancel={onEditCancel}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        ))}
    </div>
  );
}
