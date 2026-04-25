"use client";

/**
 * ToastContainer — Global toast stack
 *
 * Renders toasts in a fixed position stack. Mobile-aware positioning
 * (avoids overlap with floating action buttons).
 */

import { Toast, type ToastType } from "./Toast";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[60] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-[400px]"
      style={{
        // Desktop: top-right
        // Mobile: top-center (avoids bottom FAB overlap)
        top: "1rem",
        right: "1rem",
        left: "auto",
      }}
    >
      {/* Mobile adjustment via CSS media query handled by Tailwind classes */}
      <div className="md:static fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-[360px] flex flex-col gap-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            type={toast.type}
            title={toast.title}
            message={toast.message}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}
