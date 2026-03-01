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
  selectedIds?: Set<number>;
  editingId: number | null;
  editText: string;
  dragId: number | null;
  searchQuery?: string;
  siblingIndex?: number;
  parentOl?: boolean;
  cursorPosition?: number;
  editTrigger?: number;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onStartEdit: (id: number) => void;
  onEditTextChange: (text: string) => void;
  onEditConfirm: () => void;
  onEditCancel: () => void;
  onEditSplit: (before: string, after: string) => void;
  onMergeWithPrevious: (text: string) => void;
  onMergeWithNext: (text: string) => void;
  onIndent: (cursorPos: number) => void;
  onOutdent: (cursorPos: number) => void;
  onDeselect: () => void;
  onMoveToPreviousEnd: (cursorPos?: number) => void;
  onMoveToNextStart: () => void;
  onShiftBoundary: (direction: 'up' | 'down', fromStart: boolean) => void;
  onTreeCopy: () => void;
  onTreeCut: () => void;
  onTreePaste: ((atStart: boolean) => void) | null;
  onTextCopied: () => void;
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
  selectedIds,
  editingId,
  editText,
  dragId,
  searchQuery,
  siblingIndex,
  parentOl,
  cursorPosition,
  editTrigger,
  onSelect,
  onToggle,
  onStartEdit,
  onEditTextChange,
  onEditConfirm,
  onEditCancel,
  onEditSplit,
  onMergeWithPrevious,
  onMergeWithNext,
  onIndent,
  onOutdent,
  onDeselect,
  onMoveToPreviousEnd,
  onMoveToNextStart,
  onShiftBoundary,
  onTreeCopy,
  onTreeCut,
  onTreePaste,
  onTextCopied,
  onDragStart,
  onDrop,
  onDragEnd,
}: TreeNodeProps) {
  const isSelected = selectedId === node.id;
  const isMultiSelected = selectedIds?.has(node.id) ?? false;
  const isEditing = editingId === node.id;
  const isDragging = dragId === node.id;
  const hasChildren = node.children.length > 0;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);
  const [dropIndent, setDropIndent] = useState<number>(1);
  const cleanCursorRef = useRef<number>(0);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const pos = cursorPosition !== undefined
        ? Math.min(cursorPosition, textareaRef.current.value.length)
        : 0;
      textareaRef.current.setSelectionRange(pos, pos);
      autoResize(textareaRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, editTrigger]);

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
        className={`flex items-start cursor-pointer select-none pr-2 relative ${
          isDragging
            ? "opacity-40"
            : isMultiSelected
              ? "bg-blue-100 dark:bg-blue-900/30"
              : ""
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

        {node.ol && (
          <span className="absolute -left-5 top-1/2 -translate-y-1/2 px-0.5 text-[9px] leading-3 rounded border border-zinc-300 dark:border-zinc-600 text-zinc-400 dark:text-zinc-500 select-none">
            OL
          </span>
        )}

        {hasChildren ? (
          <span
            className="shrink-0 text-zinc-400 cursor-pointer flex items-center justify-center"
            style={{ paddingTop: "5px", paddingBottom: "5px", paddingLeft: "5px", paddingRight: "5px" }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(node.id);
              onToggle(node.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <svg width="7" height="7" viewBox="0 0 8 8" className={`transition-transform ${node.closed ? "" : "rotate-90"}`}>
              <path d="M2 1L6 4 2 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : (
          <span className="shrink-0 text-zinc-400 flex items-center justify-center" style={{ paddingTop: "5px", paddingBottom: "5px", paddingLeft: "5px", paddingRight: "5px" }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <svg width="7" height="7" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="1.5" fill="currentColor" />
            </svg>
          </span>
        )}

        {bullet && (
          <span className="shrink-0 text-zinc-400 tabular-nums mr-1">{bullet}</span>
        )}

        {isEditing ? (
          <textarea
            ref={textareaRef}
            rows={1}
            className="flex-1 bg-transparent px-0 outline-none border-none resize-none overflow-hidden caret-blue-500"
            style={{ overflowWrap: "break-word", wordBreak: "break-all" }}
            value={editText}
            onChange={(e) => {
              onEditTextChange(e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={(e) => {
              // Track cursor position while text is clean (for Ctrl+Z revert)
              if (editText === node.text) {
                cleanCursorRef.current = e.currentTarget.selectionStart ?? 0;
              }

              // Ctrl+Z: two-stage undo
              // 1) If unsaved changes exist, revert to stored text
              // 2) If no unsaved changes, let bubble for tree-level undo
              if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
                if (editText !== node.text) {
                  e.preventDefault();
                  const pos = cleanCursorRef.current;
                  onEditTextChange(node.text);
                  if (textareaRef.current) {
                    autoResize(textareaRef.current);
                    requestAnimationFrame(() => {
                      if (textareaRef.current) {
                        const clamped = Math.min(pos, node.text.length);
                        textareaRef.current.setSelectionRange(clamped, clamped);
                      }
                    });
                  }
                  e.stopPropagation();
                  return;
                }
                // No unsaved changes — let bubble for tree-level undo
                return;
              }

              // Ctrl+Y / Ctrl+Shift+Z: let bubble for tree-level redo
              if (e.ctrlKey && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
                return;
              }

              // Ctrl+M: let bubble for markdown export
              if (e.ctrlKey && e.key === "m") {
                return;
              }

              // Ctrl+ArrowUp/Down: let bubble for scroll
              if (e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                return;
              }

              // Ctrl+Shift+L: let bubble for toggle OL
              if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
                return;
              }

              // Ctrl+C: tree-level copy (only when no text is selected)
              if (e.ctrlKey && e.key === "c") {
                const ta = e.currentTarget as HTMLTextAreaElement;
                if (ta.selectionStart !== ta.selectionEnd) {
                  e.stopPropagation(); // prevent global handler from doing node copy
                  return; // let native copy handle selected text
                }
                e.preventDefault();
                e.stopPropagation();
                onEditConfirm();
                onTreeCopy();
                return;
              }

              // Ctrl+X: tree-level cut (only when no text is selected)
              if (e.ctrlKey && e.key === "x") {
                const ta = e.currentTarget as HTMLTextAreaElement;
                if (ta.selectionStart !== ta.selectionEnd) {
                  e.stopPropagation(); // prevent global handler from doing node cut
                  return; // let native cut handle selected text
                }
                e.preventDefault();
                e.stopPropagation();
                onEditConfirm();
                onTreeCut();
                return;
              }

              // Ctrl+V: tree-level paste if clipboard has content
              if (e.ctrlKey && e.key === "v" && onTreePaste) {
                const ta = e.currentTarget as HTMLTextAreaElement;
                const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
                e.preventDefault();
                e.stopPropagation();
                onEditConfirm();
                onTreePaste(atStart);
                return;
              }

              // Shift+ArrowUp/Down: text selection, then node selection at boundary
              if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.shiftKey) {
                const ta = e.currentTarget;
                const isDown = e.key === "ArrowDown";
                const atStart = ta.selectionStart === 0;
                const atEnd = ta.selectionEnd === editText.length;
                const atBoundary = isDown
                  ? atEnd || atStart
                  : atStart || atEnd;
                if (atBoundary) {
                  e.preventDefault();
                  onEditConfirm();
                  // fromStart: cursor at pos 0 with no selection (not text-selected to start)
                  const noSelection = ta.selectionStart === ta.selectionEnd;
                  onShiftBoundary(isDown ? 'down' : 'up', atStart && noSelection);
                }
                e.stopPropagation();
                return;
              }

              // ArrowUp/Down: navigate to adjacent node at text boundary
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                const ta = e.currentTarget;
                const isDown = e.key === "ArrowDown";
                const atEnd = ta.selectionStart === editText.length && ta.selectionEnd === editText.length;
                const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
                if (isDown && (atEnd || atStart)) {
                  e.preventDefault();
                  onMoveToNextStart();
                } else if (!isDown && atStart) {
                  e.preventDefault();
                  onMoveToPreviousEnd(0);
                }
                e.stopPropagation();
                return;
              }

              // Ctrl+ArrowRight: expand node
              if (e.key === "ArrowRight" && e.ctrlKey) {
                e.preventDefault();
                if (hasChildren && node.closed) onToggle(node.id);
                e.stopPropagation();
                return;
              }

              // Ctrl+ArrowLeft: collapse node
              if (e.key === "ArrowLeft" && e.ctrlKey) {
                e.preventDefault();
                if (hasChildren && !node.closed) onToggle(node.id);
                e.stopPropagation();
                return;
              }

              // ArrowLeft at position 0: move to previous node's end
              if (e.key === "ArrowLeft") {
                const ta = e.currentTarget;
                if (ta.selectionStart === 0 && ta.selectionEnd === 0) {
                  e.preventDefault();
                  onMoveToPreviousEnd();
                  e.stopPropagation();
                  return;
                }
              }

              // ArrowRight at end: move to next node's start
              if (e.key === "ArrowRight") {
                const ta = e.currentTarget;
                if (ta.selectionStart === editText.length && ta.selectionEnd === editText.length) {
                  e.preventDefault();
                  onMoveToNextStart();
                  e.stopPropagation();
                  return;
                }
              }

              // Tab / Shift+Tab: indent/outdent
              if (e.key === "Tab") {
                e.preventDefault();
                const pos = e.currentTarget.selectionStart ?? 0;
                if (e.shiftKey) {
                  onOutdent(pos);
                } else {
                  onIndent(pos);
                }
                e.stopPropagation();
                return;
              }

              // Backspace at position 0: merge with previous
              if (e.key === "Backspace") {
                const ta = e.currentTarget;
                if (ta.selectionStart === 0 && ta.selectionEnd === 0) {
                  e.preventDefault();
                  onMergeWithPrevious(editText);
                  e.stopPropagation();
                  return;
                }
              }

              // Ctrl+Delete: confirm edit and let bubble to global delete handler
              if (e.key === "Delete" && e.ctrlKey) {
                onEditConfirm();
                return; // Don't stopPropagation — bubble to global handler
              }

              // Delete at end: merge with next
              if (e.key === "Delete") {
                const ta = e.currentTarget;
                if (ta.selectionStart === editText.length && ta.selectionEnd === editText.length) {
                  e.preventDefault();
                  onMergeWithNext(editText);
                  e.stopPropagation();
                  return;
                }
              }

              // Ctrl+Enter: confirm edit and let bubble for add child
              if (e.key === "Enter" && e.ctrlKey) {
                onEditConfirm();
                return; // Bubble to global handler
              }

              // Enter: split at cursor
              if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                const ta = e.currentTarget;
                const pos = ta.selectionStart ?? editText.length;
                const before = editText.slice(0, pos);
                const after = editText.slice(pos);
                onEditSplit(before, after);
                e.stopPropagation();
                return;
              }

              // Escape: confirm + deselect
              if (e.key === "Escape") {
                e.preventDefault();
                onEditConfirm();
                onDeselect();
                e.stopPropagation();
                return;
              }

              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            onCopy={onTextCopied}
          />
        ) : (
          <span className="whitespace-pre-wrap" style={{ overflowWrap: "break-word", wordBreak: "break-all" }}>
            {node.text ? (
              <HighlightedText text={node.text} query={searchQuery || ""} />
            ) : (
              <span>&nbsp;</span>
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
            selectedIds={selectedIds}
            editingId={editingId}
            editText={editText}
            dragId={dragId}
            searchQuery={searchQuery}
            siblingIndex={idx}
            parentOl={node.ol}
            cursorPosition={cursorPosition}
            editTrigger={editTrigger}
            onSelect={onSelect}
            onToggle={onToggle}
            onStartEdit={onStartEdit}
            onEditTextChange={onEditTextChange}
            onEditConfirm={onEditConfirm}
            onEditCancel={onEditCancel}
            onEditSplit={onEditSplit}
            onMergeWithPrevious={onMergeWithPrevious}
            onMergeWithNext={onMergeWithNext}
            onIndent={onIndent}
            onOutdent={onOutdent}
            onDeselect={onDeselect}
            onMoveToPreviousEnd={onMoveToPreviousEnd}
            onMoveToNextStart={onMoveToNextStart}
            onShiftBoundary={onShiftBoundary}
            onTreeCopy={onTreeCopy}
            onTreeCut={onTreeCut}
            onTreePaste={onTreePaste}
            onTextCopied={onTextCopied}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        ))}
    </div>
  );
}
