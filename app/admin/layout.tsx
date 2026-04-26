import AdminSidebar from "../components/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen text-[var(--text)]" style={{ background: "var(--bg)" }}>
      <AdminSidebar />
      <main className="ml-56 flex-1 min-h-screen border-l border-[var(--line)]">{children}</main>
    </div>
  );
}
