"use client";

import { DemoProvider } from "@/components/od/DemoProvider";

export function Providers({ children, demoEnabled, collegeName, departmentName, allowedEmailDomain }: { children: React.ReactNode; demoEnabled: boolean; collegeName: string; departmentName: string; allowedEmailDomain: string }) {
  return <DemoProvider demoEnabled={demoEnabled} collegeName={collegeName} departmentName={departmentName} allowedEmailDomain={allowedEmailDomain}>{children}</DemoProvider>;
}
