import AdminSidebar from "../components/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-black">
      <AdminSidebar />
      <main className="ml-56 flex-1 min-h-screen">{children}</main>
    </div>
  );
}
