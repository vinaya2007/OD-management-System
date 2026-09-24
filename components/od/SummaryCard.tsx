import type { LucideIcon } from "lucide-react";

export function SummaryCard({ label, value, icon: Icon, tone = "blue" }: { label: string; value: string | number; icon: LucideIcon; tone?: "blue" | "green" | "amber" | "red" | "purple" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    purple: "bg-purple-50 text-purple-700"
  };
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold text-navy">{value}</p>
    </div>
  );
}
