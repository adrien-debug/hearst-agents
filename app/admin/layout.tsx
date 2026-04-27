export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen text-[var(--text)]" style={{ background: "var(--bg)" }}>
      {children}
    </div>
  );
}
