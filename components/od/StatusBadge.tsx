import { statusTone } from "@/lib/od-rules";

const classes: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  yellow: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200"
};

export function StatusBadge({ value, special = false }: { value: string; special?: boolean }) {
  const tone = special ? "purple" : statusTone(value);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${classes[tone]}`}>{value.replaceAll("_", " ")}</span>;
}
