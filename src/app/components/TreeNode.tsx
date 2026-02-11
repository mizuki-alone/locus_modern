"use client";

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
  onSelect: (id: number) => void;
}

export default function TreeNode({ node, selectedId, onSelect }: TreeNodeProps) {
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const firstLine = node.text.split("\n")[0];

  return (
    <div>
      <div
        className={`flex items-center cursor-pointer select-none py-0.5 px-2 rounded ${
          isSelected
            ? "bg-blue-600 text-white"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
        style={{ paddingLeft: `${(node.indent - 1) * 20 + 8}px` }}
        onClick={() => onSelect(node.id)}
        data-node-id={node.id}
      >
        {hasChildren && (
          <span className="mr-1 w-4 text-center text-xs text-zinc-400">
            {node.closed ? "▶" : "▼"}
          </span>
        )}
        {!hasChildren && <span className="mr-1 w-4" />}
        <span className="truncate">{firstLine}</span>
      </div>

      {!node.closed &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}
