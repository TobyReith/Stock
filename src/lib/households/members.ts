import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Member-listing helper for the /settings/haushalt page.
 *
 * Why admin-scoped: we want to show each member's email, and `auth.users`
 * is not reachable through the user/PostgREST client. We page-scope the
 * admin lookups to the household (members via `household_members`, then
 * parallel `getUserById` per member) so we never enumerate the wider
 * auth.users table.
 *
 * The join isn't blazing fast (1 + N requests), but a household has a
 * small number of members in practice — even with generous sharing,
 * `N <= ~20`. Batching via `auth.admin.listUsers` would be worse: it
 * fetches *every* user in the project.
 */
export type HouseholdMember = {
  userId: string;
  email: string | null;
  role: "owner" | "member";
  joinedAt: string;
};

export async function listHouseholdMembers(
  householdId: string,
): Promise<HouseholdMember[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("household_members")
    .select("user_id, role, joined_at")
    .eq("household_id", householdId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(`Mitglieder laden: ${error.message}`);

  const rows = data ?? [];
  // Parallel email lookup. If any individual lookup fails we still
  // render the row — email is for display only, missing is acceptable.
  const emails = await Promise.all(
    rows.map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id);
      return data.user?.email ?? null;
    }),
  );

  return rows.map((row, i) => ({
    userId: row.user_id,
    email: emails[i],
    role: row.role === "owner" ? "owner" : "member",
    joinedAt: row.joined_at,
  }));
}
