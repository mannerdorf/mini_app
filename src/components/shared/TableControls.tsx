import React from 'react';
import './tableControls.css';

export function SortableHeader({ label, direction, onSort }: {
  label: string; direction?: 'asc' | 'desc'; onSort: () => void;
}) {
  return <th scope="col" aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}>
    <button type="button" className="table-control" onClick={event => { event.stopPropagation(); onSort(); }}>
      {label}<span aria-hidden="true">{direction === 'asc' ? ' ↑' : direction === 'desc' ? ' ↓' : ''}</span>
    </button>
  </th>;
}

export function RowDisclosure({ label, expanded, onToggle, children }: {
  label: string; expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return <button type="button" className="table-control" aria-label={label} aria-expanded={expanded}
    onClick={event => { event.stopPropagation(); onToggle(); }}>{children}<span aria-hidden="true">{expanded ? ' ▴' : ' ▾'}</span></button>;
}
