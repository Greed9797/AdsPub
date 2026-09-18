'use client';

import { useId, type ReactNode } from 'react';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';

export function ConfirmDialog({
  isOpen,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
}: {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  const titleId = useId();
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      width={480}
      padding={5}
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="my-5 space-y-4 text-sm">{children}</div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" label="Cancelar" onClick={onCancel} />
        <Button
          variant={destructive ? 'destructive' : 'primary'}
          label={confirmLabel}
          onClick={onConfirm}
        />
      </div>
    </Dialog>
  );
}
