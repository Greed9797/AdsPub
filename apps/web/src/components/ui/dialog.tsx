'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Janela modal sobre o <dialog> nativo: foco preso, Esc e clique fora fecham.
 * O preenchimento fica no corpo, para o clique no fundo ser só o do <dialog>.
 */
export function Dialog({
  isOpen,
  onOpenChange,
  width = 480,
  maxHeight,
  placement = 'center',
  'aria-labelledby': labelledBy,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  width?: number;
  maxHeight?: string;
  /** `side` ancora a janela à direita, em altura total (ficha do anúncio). */
  placement?: 'center' | 'side';
  'aria-labelledby'?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={ref}
      className={placement === 'side' ? 'ap-dialog ap-dialog--side' : 'ap-dialog'}
      aria-labelledby={labelledBy}
      style={{ width: `min(${width}px, calc(100vw - 32px))`, maxHeight }}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="ap-dialog__body">{children}</div>
    </dialog>
  );
}
