import { useMemo, useState } from 'react';
import { Dialog, Bar, Button, Input, Title } from '@ui5/webcomponents-react';

export interface SearchItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  open: boolean;
  title: string;
  placeholder: string;
  items: SearchItem[];
  onSelect: (item: SearchItem) => void;
  onClose: () => void;
}

/**
 * Generic "search by name" dialog — docs/architecture-proposal.md §3c replaces the live
 * exercise's search-by-3-digit-ID with searching a shared pool by name. Used for both the
 * Sold-To Party and Material searches.
 */
export default function SearchDialog({ open, title, placeholder, items, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.sublabel?.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <Dialog
      open={open}
      headerText={title}
      onAfterClose={onClose}
      footer={
        <Bar
          endContent={
            <Button onClick={onClose} design="Transparent">
              Cancel
            </Button>
          }
        />
      }
    >
      <div style={{ minWidth: 360, maxWidth: 480 }}>
        <Input
          placeholder={placeholder}
          value={query}
          onInput={(e) => setQuery((e.target as unknown as HTMLInputElement).value)}
          style={{ width: '100%', marginBottom: 12 }}
        />
        {filtered.length === 0 && <Title level="H6">No matches</Title>}
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              className="search-result-row"
              onClick={() => {
                onSelect(item);
                setQuery('');
              }}
            >
              <strong>{item.label}</strong>
              {item.sublabel && <div style={{ fontSize: 12, color: '#666' }}>{item.sublabel}</div>}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
