import type { Metadata } from "next";
import { Providers } from "@/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ECE OD Management",
  description: "Online On-Duty management system for the ECE department"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><Providers demoEnabled={process.env.ENABLE_DEMO_AUTH === "true"} collegeName={process.env.COLLEGE_NAME || "College"} departmentName={process.env.COLLEGE_DEPARTMENT || "ECE Department"} allowedEmailDomain={process.env.ALLOWED_EMAIL_DOMAIN || ""}>{children}</Providers></body>
    </html>
  );
}
