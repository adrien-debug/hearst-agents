import { redirect } from "next/navigation";
import { getHearstSession } from "@/lib/platform/auth";
import AdminShell from "./_shell/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getHearstSession();
  const devBypass = process.env.HEARST_DEV_AUTH_BYPASS === "1";

  if (!session?.user && !devBypass) {
    redirect("/login?callbackUrl=/admin");
  }

  const userLabel =
    session?.user?.name ??
    session?.user?.email ??
    (devBypass ? "Admin (dev)" : "Admin");
  const userInitial = (userLabel.trim()[0] ?? "A").toUpperCase();
  const env = (process.env.HEARST_ENV ?? process.env.NODE_ENV ?? "dev").toLowerCase();

  return (
    <AdminShell userLabel={userLabel} userInitial={userInitial} env={env}>
      {children}
    </AdminShell>
  );
}
