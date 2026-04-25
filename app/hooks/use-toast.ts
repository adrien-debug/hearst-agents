"use client";

/**
 * useToast — Hook for global toast notifications
 *
 * Simple implementation without external state management.
 * Uses a module-level singleton for toast queue.
 */

import { useState, useCallback, useEffect } from "react";
import type { ToastType } from "@/app/components/Toast";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

type ToastListener = (toasts: ToastItem[]) => void;

// Singleton toast manager (module-level)
class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();
  private idCounter = 0;

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l([...this.toasts]));
  }

  add(type: ToastType, title: string, message?: string): string {
    const id = `toast-${++this.idCounter}-${Date.now()}`;
    this.toasts.push({ id, type, title, message });
    this.notify();
    return id;
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear() {
    this.toasts = [];
    this.notify();
  }
}

const toastManager = new ToastManager();

// Global API for non-React contexts (error handlers, etc.)
export const toast = {
  info: (title: string, message?: string) => toastManager.add("info", title, message),
  success: (title: string, message?: string) => toastManager.add("success", title, message),
  error: (title: string, message?: string) => toastManager.add("error", title, message),
  warning: (title: string, message?: string) => toastManager.add("warning", title, message),
  dismiss: (id: string) => toastManager.dismiss(id),
  clear: () => toastManager.clear(),
};

// React hook
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toastManager.subscribe(setToasts);
  }, []);

  const dismiss = useCallback((id: string) => {
    toastManager.dismiss(id);
  }, []);

  const add = useCallback((type: ToastType, title: string, message?: string) => {
    return toastManager.add(type, title, message);
  }, []);

  return {
    toasts,
    dismiss,
    add,
    // Convenience methods
    info: (title: string, message?: string) => add("info", title, message),
    success: (title: string, message?: string) => add("success", title, message),
    error: (title: string, message?: string) => add("error", title, message),
    warning: (title: string, message?: string) => add("warning", title, message),
  };
}
