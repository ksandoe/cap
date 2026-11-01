import { useState } from 'react';
import { Icon } from '@ui5/webcomponents-react';

interface TreeNode {
  label: string;
  children?: TreeNode[];
}

const LEAF_ACTIONS: TreeNode[] = [{ label: 'Create' }, { label: 'Change' }, { label: 'Display' }, { label: 'List' }];

const SALES_CATEGORIES: TreeNode[] = [
  { label: 'Inquiry', children: LEAF_ACTIONS },
  { label: 'Quotation', children: LEAF_ACTIONS },
  { label: 'Order', children: LEAF_ACTIONS },
  { label: 'Contract', children: LEAF_ACTIONS },
  { label: 'Returns', children: LEAF_ACTIONS },
];

const SD_CHILDREN: TreeNode[] = [
  { label: 'Master Data' },
  { label: 'Sales', children: SALES_CATEGORIES },
  { label: 'Shipping and Transportation' },
  { label: 'Billing' },
  { label: 'Foreign Trade' },
];

const LOGISTICS_CHILDREN: TreeNode[] = [
  { label: 'Materials Management' },
  { label: 'Sales and Distribution', children: SD_CHILDREN },
  { label: 'Logistics Execution' },
  { label: 'Quality Management' },
  { label: 'Plant Maintenance' },
];

// The real SAP Easy Access tree — decorative everywhere except the one path a given transaction
// needs. Kent's own words: "I would like to replicate the menu operations preceding each step."
const TREE: TreeNode[] = [
  { label: 'Office' },
  { label: 'Logistics', children: LOGISTICS_CHILDREN },
  { label: 'Accounting' },
  { label: 'Human Resources' },
  { label: 'Information Systems' },
  { label: 'Tools' },
];

function TreeRow({
  node,
  depth,
  path,
  expanded,
  onToggle,
  targetPath,
  onLeafClick,
}: {
  node: TreeNode;
  depth: number;
  path: string[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
  targetPath: string[];
  onLeafClick: (path: string[]) => void;
}) {
  const thisPath = [...path, node.label];
  const key = thisPath.join('/');
  const isOpen = expanded.has(key);
  const isLeaf = !node.children;
  const isOnTargetChain = targetPath.slice(0, thisPath.length).join('/') === key;

  return (
    <div>
      <div
        className={`easy-access-row${isLeaf ? ' easy-access-leaf' : ''}`}
        style={{ paddingLeft: 12 + depth * 18 }}
        onClick={() => (isLeaf ? onLeafClick(thisPath) : onToggle(key))}
      >
        {!isLeaf && <span className="easy-access-caret">{isOpen ? '▾' : '▸'}</span>}
        <Icon name={isLeaf ? 'document' : isOpen ? 'open-folder' : 'folder'} />
        <span className={isOnTargetChain ? 'easy-access-label-target' : undefined}>{node.label}</span>
      </div>
      {!isLeaf && isOpen && (
        <div>
          {node.children!.map((child) => (
            <TreeRow
              key={child.label}
              node={child}
              depth={depth + 1}
              path={thisPath}
              expanded={expanded}
              onToggle={onToggle}
              targetPath={targetPath}
              onLeafClick={onLeafClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The SAP Easy Access screen — what a real session shows before any transaction, and what SAP
 * always returns you to after Exit. Only one path through this tree does anything; everything
 * else is here so the tree looks (and gets lost in) like the real one.
 */
export default function EasyAccessMenu({ targetPath, onNavigate }: { targetPath: string[]; onNavigate: () => void }) {
  // Auto-expand the branch down to (but not including) the target leaf, matching how a student
  // who has already been told the path would work through it — the point is the path itself,
  // not a scavenger hunt for which folder to click first.
  const initial = new Set<string>();
  for (let i = 1; i < targetPath.length; i++) {
    initial.add(targetPath.slice(0, i).join('/'));
  }
  const [expanded, setExpanded] = useState<Set<string>>(initial);
  const [missedClick, setMissedClick] = useState(false);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleLeafClick(path: string[]) {
    if (path.join('/') === targetPath.join('/')) {
      onNavigate();
    } else {
      setMissedClick(true);
    }
  }

  return (
    <div className="easy-access-menu">
      <div className="easy-access-title">SAP Easy Access</div>
      {missedClick && (
        <div className="easy-access-hint">
          Not part of today's exercise — follow {targetPath.join(' ▸ ')}.
        </div>
      )}
      <div className="easy-access-tree">
        {TREE.map((node) => (
          <TreeRow
            key={node.label}
            node={node}
            depth={0}
            path={[]}
            expanded={expanded}
            onToggle={toggle}
            targetPath={targetPath}
            onLeafClick={handleLeafClick}
          />
        ))}
      </div>
    </div>
  );
}
