"use client";

import { DemoProvider } from "@/components/od/DemoProvider";

export function Providers({ children, collegeName, departmentName, allowedEmailDomain }: { children: React.ReactNode; collegeName: string; departmentName: string; allowedEmailDomain: string }) {
  return <DemoProvider collegeName={collegeName} departmentName={departmentName} allowedEmailDomain={allowedEmailDomain}>{children}</DemoProvider>;
}
