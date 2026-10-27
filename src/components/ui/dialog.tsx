"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content className="dialog-content">
          <div className="flex items-center justify-between mb-5">
            <D.Title className="text-xl font-bold">{title}</D.Title>
            <D.Close aria-label="Close" className="icon-btn">
              <X size={20} />
            </D.Close>
          </div>
          <D.Description className="sr-only">{title} form</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
