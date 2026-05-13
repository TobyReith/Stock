import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/session";
import { BottomNav } from "@/components/bottom-nav";
import { TopBar } from "@/components/top-bar";
import { FeedbackFab } from "@/components/feedback/feedback-fab";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="flex-1 pt-11 pb-[calc(5rem+env(safe-area-inset-bottom))] overflow-x-hidden">
        {children}
      </main>
      <BottomNav />
      <FeedbackFab />
    </div>
  );
}
