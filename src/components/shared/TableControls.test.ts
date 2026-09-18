import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { SortableHeader, RowDisclosure } from './TableControls';
it('announces sorting on a table header and invokes it through a native button',()=>{
 const onSort=vi.fn(),stopPropagation=vi.fn();let root:any;
 act(()=>{root=create(React.createElement(SortableHeader,{label:'Дата',direction:'desc',onSort}));});
 expect(root.root.findByType('th').props['aria-sort']).toBe('descending');
 act(()=>root.root.findByType('button').props.onClick({stopPropagation}));
 expect(onSort).toHaveBeenCalledTimes(1);expect(stopPropagation).toHaveBeenCalled();act(()=>root.unmount());
});
it('exposes expanded state and prevents a second toggle by the surrounding row',()=>{
 const onToggle=vi.fn(),stopPropagation=vi.fn();let root:any;
 act(()=>{root=create(React.createElement(RowDisclosure,{label:'Заявка 001',expanded:true,onToggle,children:'001'}));});
 const button=root.root.findByType('button');expect(button.props['aria-expanded']).toBe(true);
 act(()=>button.props.onClick({stopPropagation}));expect(onToggle).toHaveBeenCalledTimes(1);expect(stopPropagation).toHaveBeenCalled();act(()=>root.unmount());
});
