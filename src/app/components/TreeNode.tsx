"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";

export interface TreeNodeData {
  id: number;
  text: string;
  indent: number;
  closed: boolean;
  children: TreeNodeData[];
  ol?: boolean;
}

type DropPosition = "before" | "after" | "child" | null;

interface TreeNodeProps {
  node: TreeNodeData;
  selectedId: number | null;
  editingId: number | null;
  editText: string;
  dragId: number | null;
  searchQuery?: string;
  siblingIndex?: number;
  parentOl?: boolean;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onStartEdit: (id: number) => void;
  onEditTextChange: (text: string) => void;
  onEditConfirm: () => void;
  onEditCancel: () => void;
  onDragStart: (id: number) => void;
  onDrop: (dragId: number, targetId: number, position: "before" | "after" | "child", indent?: number) => void;
  onDragEnd: () => void;
}

/** Highlight search query matches in text */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;

  let pos = lowerText.indexOf(lowerQuery, lastIndex);
  while (pos !== -1) {
    if (pos > lastIndex) {
      parts.push({ text: text.slice(lastIndex, pos), highlight: false });
    }
    parts.push({ text: text.slice(pos, pos + query.length), highlight: true });
    lastIndex = pos + query.length;
    pos = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  if (parts.length === 0) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded-sm px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

export default function TreeNode({
  node,
  selectedId,
  editingId,
  editText,
  dragId,
  searchQuery,
  siblingIndex,
  parentOl,
  onSelect,
  onToggle,
  onStartEdit,
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
        const rawIndent = Math.max(0, Math.ceil(relativeX / 20));
        setDropIndent(Math.max(0, Math.min(rawIndent, node.indent)));
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

  // Determine the bullet/number for this node
  const bullet = useMemo(() => {
    if (parentOl && siblingIndex !== undefined) {
      return `${siblingIndex + 1}.`;
    }
    return null;
  }, [parentOl, siblingIndex]);

  return (
    <div>
      <div
        ref={rowRef}
        className={`flex items-start cursor-pointer select-none pr-2 rounded relative ${
          isDragging
            ? "opacity-40"
            : isSelected
              ? "bg-blue-100 dark:bg-blue-900/30"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
        } ${dropPosition === "child" ? "ring-2 ring-blue-400" : ""}`}
        style={{ marginLeft: `${node.indent * 12 + 16}px` }}
        onClick={() => onSelect(node.id)}
        onDoubleClick={() => onStartEdit(node.id)}
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
            style={{ left: `${(dropIndent - node.indent) * 12}px` }}
          />
        )}
        {dropPosition === "after" && (
          <div
            className="absolute right-0 bottom-0 h-0.5 bg-blue-500 translate-y-1/2"
            style={{ left: `${(dropIndent - node.indent) * 12}px` }}
          />
        )}

        {hasChildren ? (
          <span
            className="w-3 shrink-0 text-zinc-400 cursor-pointer"
            style={{ marginTop: "5px" }}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <svg width="7" height="7" viewBox="0 0 8 8" className={`transition-transform ${node.closed ? "" : "rotate-90"}`}>
              <path d="M2 1L6 4 2 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : (
          <span className="w-3 shrink-0 text-zinc-400" style={{ marginTop: "5px" }}>
            <svg width="7" height="7" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="1.5" fill="currentColor" />
            </svg>
          </span>
        )}

        {bullet && (
          <span className="shrink-0 text-zinc-400 tabular-nums mr-0.5">{bullet}</span>
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
          <span className="whitespace-pre-wrap">
            {node.text ? (
              <HighlightedText text={node.text} query={searchQuery || ""} />
            ) : (
              <span className="text-zinc-400">(empty)</span>
            )}
          </span>
        )}
      </div>

      {!node.closed &&
        node.children.map((child, idx) => (
          <TreeNode
            key={child.id}
            node={child}
            selectedId={selectedId}
            editingId={editingId}
            editText={editText}
            dragId={dragId}
            searchQuery={searchQuery}
            siblingIndex={idx}
            parentOl={node.ol}
            onSelect={onSelect}
            onToggle={onToggle}
            onStartEdit={onStartEdit}
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
