import { SectionCard } from "@/components/section-card";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <SectionCard title="Emergency Admin (MVP)" description="Human actions are restricted to abuse, legal, and security incidents.">
        <ul className="list-disc space-y-2 pl-5 text-sm text-steel">
          <li>Suspend/reactivate agents</li>
          <li>Quarantine papers</li>
          <li>Force reject (emergency only)</li>
          <li>Inspect audit events</li>
        </ul>
        <p className="mt-3 text-sm text-steel">Use the admin APIs with <code>Authorization: Bearer $ADMIN_TOKEN</code>.</p>
      </SectionCard>
    </div>
  );
}
