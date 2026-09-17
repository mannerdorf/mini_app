import "./guardedDialog.css";
import React, { useEffect, useRef } from 'react';

export function useDialogClose(onClose: () => void, dirty: boolean, busy = false) {
  return () => { if (!busy && (!dirty || window.confirm('Закрыть форму без сохранения изменений?'))) onClose(); };
}

/** Native modal supplies focus containment, Escape and inert background. */
export function GuardedDialog({ children, title, onClose, className }: {
  children: React.ReactNode; title: string; onClose: () => void; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} className={className} tabIndex={-1}
    style={{ color: 'inherit', maxHeight: '95dvh', overflow: 'auto' }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,[tabindex]:not([tabindex="-1"])'))
        .filter(node => !node.matches(':disabled') && node.tabIndex >= 0 && node.getClientRects().length > 0);
      const target = event.shiftKey ? nodes.at(-1) : nodes[0];
      if (!nodes.length || document.activeElement === (event.shiftKey ? nodes[0] : nodes.at(-1)) || document.activeElement === event.currentTarget) {
        event.preventDefault(); (target || event.currentTarget).focus();
      }
    }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) {
      const box = event.currentTarget.getBoundingClientRect();
      if (className === "modal-overlay" || event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    } }}>{children}</dialog>;
}
