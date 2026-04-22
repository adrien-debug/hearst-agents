"use client";

import { SessionProvider } from "next-auth/react";

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="h-screen w-full bg-black text-white flex flex-col overflow-hidden">
        {children}
      </div>
    </SessionProvider>
  );
}
