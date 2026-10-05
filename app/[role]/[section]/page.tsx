import { notFound } from "next/navigation";
import { SecondaryPageContent } from "@/components/layout/SecondaryPageContent";

const roles = new Set(["student", "faculty", "hod", "admin"]);

export default async function SecondaryPage({ params }: PageProps<"/[role]/[section]">) {
  const { role, section } = await params;
  if (!roles.has(role) || !section.trim()) notFound();

  return <SecondaryPageContent section={section} />;
}
