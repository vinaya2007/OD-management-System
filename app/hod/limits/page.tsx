import { requireHod } from "@/lib/auth";
import { HODLimitsEditor } from "@/components/hod/HODLimitsEditor";

export default async function Page() {
  await requireHod();
  return <HODLimitsEditor />;
}
