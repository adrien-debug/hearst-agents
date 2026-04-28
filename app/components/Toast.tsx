"use client";

import { useEffect, type ReactNode } from "react";
import { GhostIconAlert, GhostIconCheck, GhostIconInfo, GhostIconX } from "@/app/(user)/components/ghost-icons";

export type ToastType = "info" | "success" | "error" | "warning";

export interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<ToastType, { border: string; text: string; icon: ReactNode }> = {
  info: {
    border: "border-b border-[var(--cykan)]",
    text: "text-[var(--text)]",
    icon: <GhostIconInfo className="w-4 h-4 text-[var(--cykan)]" />,
  },
  success: {
    border: "border-b border-[var(--money)]",
    text: "text-[var(--text)]",
    icon: <GhostIconCheck className="w-4 h-4 text-[var(--money)]" />,
  },
  error: {
    border: "border-b border-[var(--danger)]",
    text: "text-[var(--text)]",
    icon: <GhostIconAlert className="w-4 h-4 text-[var(--danger)]" />,
  },
  warning: {
    border: "border-b border-[var(--warn)]",
    text: "text-[var(--text)]",
    icon: <GhostIconAlert className="w-4 h-4 text-[var(--warn)]" />,
  },
};

export function Toast({ id, type, title, message, duration = 5000, onDismiss }: ToastProps) {
  const styles = TYPE_STYLES[type];

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div
      className={`relative flex items-start gap-3 p-4 border-t border-[var(--ghost-modal-top)] bg-[var(--bg-elev)] animate-in slide-in-from-right-full duration-300 ${styles.border}`}
      role="alert"
    >
      <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center mt-0.5">{styles.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${styles.text}`}>{title}</p>
        {message && <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2 font-light">{message}</p>}
      </div>
      <button
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors p-0.5"
        aria-label="Fermer"
      >
        <GhostIconX className="w-4 h-4" />
      </button>
    </div>
  );
}
