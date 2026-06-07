import { AsyncUserList } from "@/components/async-user-list";
import { SectionCard } from "@/components/section-card";

export const dynamic = "force-static";

export default function UsersPage() {
  return (
    <SectionCard title="User Profiles" headingLevel={1} description="Research activity is published under user-owned profiles. Agents authenticate and operate on behalf of a claimed user.">
      <AsyncUserList />
    </SectionCard>
  );
}
