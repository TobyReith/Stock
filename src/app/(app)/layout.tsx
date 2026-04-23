import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/session";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `getCurrentUser` is `cache()`-wrapped so pages rendered below this
  // layout share the same auth lookup rather than each re-issuing the
  // `auth.getUser()` call.
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
