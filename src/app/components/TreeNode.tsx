"use client";

import { useRef, useEffect } from "react";

export interface TreeNodeData {
  id: number;
  text: string;
  indent: number;
  closed: boolean;
  children: TreeNodeData[];
}

interface TreeNodeProps {
  node: TreeNodeData;
  selectedId: number | null;
  editingId: number | null;
  editText: string;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onEditTextChange: (text: string) => void;
  onEditConfirm: () => void;
  onEditCancel: () => void;
}

export default function TreeNode({
  node,
  selectedId,
  editingId,
  editText,
  onSelect,
  onToggle,
  onEditTextChange,
  onEditConfirm,
  onEditCancel,
}: TreeNodeProps) {
  const isSelected = selectedId === node.id;
  const isEditing = editingId === node.id;
  const hasChildren = node.children.length > 0;
  const hasMultiline = node.text.includes("\n");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div>
      <div
        className={`flex items-start cursor-pointer select-none py-0.5 px-2 rounded ${
          isSelected
            ? "bg-blue-600 text-white"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
        style={{ paddingLeft: `${(node.indent - 1) * 20 + 8}px` }}
        onClick={() => onSelect(node.id)}
        data-node-id={node.id}
      >
        {hasChildren ? (
          <span
            className={`mr-1 mt-0.5 w-4 shrink-0 text-center text-xs ${
              isSelected ? "text-blue-200" : "text-zinc-400"
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
            isSelected ? "text-blue-200" : "text-zinc-300 dark:text-zinc-600"
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
            onSelect={onSelect}
            onToggle={onToggle}
            onEditTextChange={onEditTextChange}
            onEditConfirm={onEditConfirm}
            onEditCancel={onEditCancel}
          />
        ))}
    </div>
  );
}
