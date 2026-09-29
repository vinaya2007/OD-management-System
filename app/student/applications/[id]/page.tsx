"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useDemo } from "@/components/od/DemoProvider";
import { ODDetail } from "@/components/od/ODDetail";

export default function StudentApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const { currentUser, applications, withdraw } = useDemo();
  const record = applications.find((item) => item.id === params.id);

  return (
    <AppShell user={currentUser}>
      {record ? (
        <ODDetail record={record} faculty={[]} viewerId={currentUser.id} viewerRole={currentUser.role} onWithdraw={record.requester?.id === currentUser.id ? () => window.confirm("Are you sure you want to withdraw this OD?") && withdraw(record.id) : undefined} />
      ) : (
        <div className="rounded-lg border border-line bg-white p-8 text-center text-muted">You don&apos;t have permission to view this application.</div>
      )}
    </AppShell>
  );
}
