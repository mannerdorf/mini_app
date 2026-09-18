import React from 'react';
import {act,create} from 'react-test-renderer';
import {it,expect,vi,afterEach} from 'vitest';
import {FilterDialog} from './FilterDialog';
let root:ReturnType<typeof create>;
afterEach(()=>{act(()=>root?.unmount());vi.unstubAllGlobals();});
it('labels both date fields and rejects a reversed interval',()=>{
 vi.stubGlobal('document',{activeElement:null});
 const onApply=vi.fn(),onClose=vi.fn();
 act(()=>{root=create(React.createElement(FilterDialog,{isOpen:true,dateFrom:'2026-09-20',dateTo:'2026-09-19',onApply,onClose}));});
 expect(root.root.findByType('dialog').props['aria-label']).toBe('Произвольный диапазон');
 const fields=root.root.findAllByType('input');
 expect(fields.map(f=>f.props['aria-label'])).toEqual(['Дата начала','Дата окончания']);
 act(()=>root.root.findByType('form').props.onSubmit({preventDefault:vi.fn()}));
 expect(onApply).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();
 act(()=>fields[0].props.onChange({target:{value:'2026-09-18'}}));
 act(()=>root.root.findByType('form').props.onSubmit({preventDefault:vi.fn()}));
 expect(onApply).toHaveBeenCalledWith('2026-09-18','2026-09-19');expect(onClose).toHaveBeenCalledTimes(1);
});
