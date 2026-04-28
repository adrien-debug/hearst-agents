export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen text-text bg-bg">
      {children}
    </div>
  );
}
