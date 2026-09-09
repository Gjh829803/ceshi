import React from "react";
import { X } from "lucide-react";
import {
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import "./modal-layout.css";
export function ModalHeader({
  title,
  closeLabel = "关闭",
}: {
  title: string;
  closeLabel?: string;
}) {
  return (
    <DialogHeader className="modal-header">
      <DialogTitle className="modal-title">{title}</DialogTitle>
      <DialogClose asChild>
        <Button
          variant="ghost"
          size="icon"
          className="modal-close"
          aria-label={closeLabel}
        >
          <X size={18} aria-hidden="true" />
        </Button>
      </DialogClose>
    </DialogHeader>
  );
}
export function ModalFooter({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogFooter className={`modal-footer ${className}`}>
      {children}
    </DialogFooter>
  );
}
