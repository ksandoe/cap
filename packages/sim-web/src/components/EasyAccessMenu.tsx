import { useState } from 'react';
import { Button, Icon } from '@ui5/webcomponents-react';

interface TreeNode {
  label: string;
  children?: TreeNode[];
}

// Matches Kent's own screenshot of perth.cob.csuchico.edu's SAP Easy Access screen, 2026-11-01,
// and the icon names he confirmed against the official explorer
// (https://ui5.sap.com/test-resources/sap/m/demokit/iconExplorer/webapp/index.html#/overview):
// transaction leaves (Create/Change/Display) use "database", folders use "folder-blank"/
// "open-folder". Everything else at every level — even one-off decorative items with nothing real
// behind them — is a folder with the chevron + folder icon (an empty `children: []` is enough);
// leaving any of them as a bare leaf renders it with the leaf icon and no chevron, visibly out of
// line with its real-folder siblings — the same "Logistics looks slightly indented" mismatch, one
// level deeper.
const LEAF_ACTIONS: TreeNode[] = [
  { label: 'Create' },
  { label: 'Change' },
  { label: 'Display' },
  { label: 'Subsequent Functions', children: [] },
];

const SALES_CHILDREN: TreeNode[] = [
  { label: 'Inquiry', children: LEAF_ACTIONS },
  { label: 'Quotation', children: LEAF_ACTIONS },
  { label: 'Order', children: LEAF_ACTIONS },
  { label: 'Returnable Packaging Settlement' },
];

const SD_CHILDREN: TreeNode[] = [
  { label: 'Master Data', children: [] },
  { label: 'Sales', children: SALES_CHILDREN },
  { label: 'Scheduling Agreement', children: [] },
  { label: 'Contract', children: [] },
  { label: 'Backorders', children: [] },
  { label: 'Product Cost by Sales Order', children: [] },
  { label: 'Customer Replenishment', children: [] },
  { label: 'Environment', children: [] },
  { label: 'Information System', children: [] },
  { label: 'Tools', children: [] },
];

// Order matches Kent's 2026-11-01 Easy Access screenshot: Shipping and Transportation / Bill of
// Services / Billing / Credit Management / Sales Information System sit beside Sales and
// Distribution under Logistics — they're not children of it, an easy mistake from the first,
// shallower screenshot.
const LOGISTICS_CHILDREN: TreeNode[] = [
  { label: 'Equipment and Tools Management', children: [] },
  { label: 'Materials Management', children: [] },
  { label: 'Governance, Risk and Compliance', children: [] },
  { label: 'Sales and Distribution', children: SD_CHILDREN },
  { label: 'Shipping and Transportation', children: [] },
  { label: 'Bill of Services', children: [] },
  { label: 'Billing', children: [] },
  { label: 'Credit Management', children: [] },
  { label: 'Sales Information System', children: [] },
  { label: 'Logistics Execution', children: [] },
  { label: 'SCM Extended Warehouse Management', children: [] },
  { label: 'Transportation Management', children: [] },
  { label: 'Production', children: [] },
  { label: 'Production - Process', children: [] },
  { label: 'Advanced Planning', children: [] },
  { label: 'Extended Service Parts Planning', children: [] },
  { label: 'Plant Maintenance', children: [] },
  { label: 'Customer Service', children: [] },
  { label: 'Quality Management', children: [] },
];

// The real SAP Easy Access tree — decorative everywhere except the one path a given transaction
// needs. Kent's own words: "I would like to replicate the menu operations preceding each step."
// Every top-level entry is a folder (even the ones with nothing behind them) — an empty-children
// array still gets the chevron and folder icon, matching real SAP, where "Office" or "Accounting"
// look identical to "Logistics" until you open them. Leaving one as a plain leaf (no `children` at
// all) would render it with the transaction-leaf icon and no chevron, visibly out of line with its
// siblings — exactly the "Logistics looks slightly indented" mismatch Kent flagged on 2026-11-01.
const TREE: TreeNode[] = [
  { label: 'Connector for Multi-Bank Connectivity', children: [] },
  { label: 'Global Bike Transactions', children: [] },
  { label: 'Office', children: [] },
  { label: 'Cross-Application Components', children: [] },
  { label: 'Logistics', children: LOGISTICS_CHILDREN },
  { label: 'Accounting', children: [] },
  { label: 'Human Resources', children: [] },
  { label: 'Information Systems', children: [] },
  { label: 'Service', children: [] },
  { label: 'Tools', children: [] },
  { label: 'WebClient UI Framework', children: [] },
];

function TreeRow({
  node,
  depth,
  path,
  expanded,
  onToggle,
  targetPath,
  selectedPath,
  onLeafSelect,
  onLeafExecute,
}: {
  node: TreeNode;
  depth: number;
  path: string[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
  targetPath: string[];
  selectedPath: string[] | null;
  onLeafSelect: (path: string[]) => void;
  onLeafExecute: (path: string[]) => void;
}) {
  const thisPath = [...path, node.label];
  const key = thisPath.join('/');
  const isOpen = expanded.has(key);
  const isLeaf = !node.children;
  const isSelected = isLeaf && selectedPath?.join('/') === key;
  // Only the leaf itself is highlighted once reached — not every ancestor folder along the way,
  // which would tip off the path before the student has clicked anything. Per Kent's 2026-11-01
  // note: nothing should look "selected" before the student finds it themselves.
  const isOnTargetChain = key === targetPath.join('/');

  return (
    <div>
      <div
        className={`easy-access-row${isLeaf ? ' easy-access-leaf' : ''}${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: 12 + depth * 18 }}
        onClick={() => (isLeaf ? onLeafSelect(thisPath) : onToggle(key))}
        onDoubleClick={() => isLeaf && onLeafExecute(thisPath)}
      >
        {!isLeaf && <span className="easy-access-caret">{isOpen ? '▾' : '▸'}</span>}
        <Icon name={isLeaf ? 'database' : isOpen ? 'open-folder' : 'folder-blank'} />
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
              selectedPath={selectedPath}
              onLeafSelect={onLeafSelect}
              onLeafExecute={onLeafExecute}
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
  // Starts fully collapsed — per Kent's 2026-11-01 note, students should have to find the
  // transaction themselves by following the instructions, not find it already drilled open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string[] | null>(null);
  const [missedClick, setMissedClick] = useState(false);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Real SAP: a single click selects the leaf (Execute runs it, or double-click skips the step).
  function selectLeaf(path: string[]) {
    setMissedClick(false);
    setSelectedPath(path);
  }

  function executeLeaf(path: string[]) {
    if (path.join('/') === targetPath.join('/')) {
      onNavigate();
    } else {
      setMissedClick(true);
    }
  }

  return (
    <div className="easy-access-menu">
      <div className="easy-access-toolbar">
        <span>Menu ⌄</span>
        <span className="easy-access-command-field" />
        <span className="easy-access-toolbar-spacer" />
        <span className="easy-access-exit">Exit</span>
      </div>
      {missedClick && (
        <div className="easy-access-hint">Not part of today's exercise — follow {targetPath.join(' ▸ ')}.</div>
      )}
      <div className="easy-access-tree">
        <div className="easy-access-row" style={{ paddingLeft: 12 }}>
          <span className="easy-access-caret">▾</span>
          <Icon name="favorite-list" />
          <span>Favorites</span>
        </div>
        <div className="easy-access-row easy-access-leaf" style={{ paddingLeft: 30, color: '#0a6ed1' }}>
          <Icon name="favorite" />
          <span>SAP Fiori Launchpad</span>
        </div>
        <div className="easy-access-row" style={{ paddingLeft: 12 }}>
          <span className="easy-access-caret">▾</span>
          <Icon name="open-folder" />
          <span>SAP Menu</span>
        </div>
        <div>
          {TREE.map((node) => (
            <TreeRow
              key={node.label}
              node={node}
              depth={1}
              path={[]}
              expanded={expanded}
              onToggle={toggle}
              targetPath={targetPath}
              selectedPath={selectedPath}
              onLeafSelect={selectLeaf}
              onLeafExecute={executeLeaf}
            />
          ))}
        </div>
      </div>
      <div className="easy-access-footer">
        <Button design="Emphasized" disabled={!selectedPath} onClick={() => selectedPath && executeLeaf(selectedPath)}>
          Execute
        </Button>
      </div>
    </div>
  );
}
