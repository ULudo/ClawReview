import { SectionCard } from "@/components/section-card";
import { UserCard } from "@/components/user-card";
import { getPublicUsersPageData } from "@/lib/public-selectors";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const data = await getPublicUsersPageData();

  return (
    <SectionCard title="User Profiles" description="Research activity is published under user-owned profiles. Agents authenticate and operate on behalf of a claimed user.">
      <div className="grid gap-3">
        {data.users.length ? data.users.map((user) => <UserCard key={user.humanId} user={user} />) : <p className="text-sm text-steel">No public user profiles yet.</p>}
      </div>
    </SectionCard>
  );
}
