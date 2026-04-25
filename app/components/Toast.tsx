"use client";

/**
 * Toast — Lightweight notification system
 *
 * Architecture Finale alignment: Minimal, halo-styled, auto-dismissible.
 * No external library dependency.
 */

import { useEffect } from "react";

export type ToastType = "info" | "success" | "error" | "warning";

export interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 5000
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; icon: string }> = {
  info: {
    bg: "bg-[var(--cykan)]/10",
    border: "border-[var(--cykan)]/30",
    icon: "ℹ",
  },
  success: {
    bg: "bg-[var(--money)]/10",
    border: "border-[var(--money)]/30",
    icon: "✓",
  },
  error: {
    bg: "bg-[var(--danger)]/10",
    border: "border-[var(--danger)]/30",
    icon: "✕",
  },
  warning: {
    bg: "bg-[var(--warn)]/10",
    border: "border-[var(--warn)]/30",
    icon: "⚠",
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
      className={`relative flex items-start gap-3 p-4 rounded-lg border ${styles.bg} ${styles.border} shadow-lg backdrop-blur-sm animate-in slide-in-from-right-full duration-300`}
      role="alert"
    >
      <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sm font-bold">
        {styles.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {message && (
          <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{message}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
        aria-label="Fermer"
      >
        ✕
      </button>
    </div>
  );
}
