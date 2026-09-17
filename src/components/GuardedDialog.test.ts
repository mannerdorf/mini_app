import React from 'react';
import { create, act } from 'react-test-renderer';
import { it, expect, vi, afterEach } from 'vitest';
import { GuardedDialog, useDialogClose } from './GuardedDialog';
let root: ReturnType<typeof create>;
afterEach(() => { act(() => root?.unmount()); vi.unstubAllGlobals(); });
it('opens a named native modal, handles Escape and restores focus', () => {
  const previous = {isConnected:true,focus:vi.fn()};
  vi.stubGlobal('document',{activeElement:previous});
  const dialog = {showModal:vi.fn(),close:vi.fn()};
  const close = vi.fn();
  act(() => { root=create(React.createElement(GuardedDialog,{title:'Редактор',onClose:close,children:'Форма'}),{createNodeMock:()=>dialog}); });
  expect(dialog.showModal).toHaveBeenCalledTimes(1);
  const node=root.root.findByType('dialog');
  expect(node.props['aria-label']).toBe('Редактор');
  const preventDefault=vi.fn();
  act(() => node.props.onCancel({preventDefault}));
  expect(preventDefault).toHaveBeenCalled(); expect(close).toHaveBeenCalled();
  act(() => root.unmount());
  expect(previous.focus).toHaveBeenCalled();
});
it('blocks closing during save and protects dirty input', () => {
  const confirm=vi.fn().mockReturnValue(false), close=vi.fn();
  vi.stubGlobal('window',{confirm});
  let requestClose=()=>{};
  function Harness({busy}:{busy:boolean}) { requestClose=useDialogClose(close,true,busy); return null; }
  act(() => { root=create(React.createElement(Harness,{busy:true})); });
  requestClose(); expect(confirm).not.toHaveBeenCalled();
  act(() => root.update(React.createElement(Harness,{busy:false})));
  requestClose(); expect(close).not.toHaveBeenCalled();
  confirm.mockReturnValue(true); requestClose(); expect(close).toHaveBeenCalledTimes(1);
});
