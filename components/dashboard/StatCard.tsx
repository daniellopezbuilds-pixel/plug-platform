import { Card } from "@/components/ui/Card";

const borderColors: Record<string, string> = {
  yellow: "border-t-2 border-t-zinc-800",
  orange: "border-t-2 border-t-orange-500",
  blue: "border-t-2 border-t-zinc-800",
};

export function StatCard({
  label,
  value,
  accent = false,
  borderAccent = "yellow",
}: {
  label: string;
  /** null means "not counted yet" — rendered as a dash, never as 0. */
  value: string | number | null;
  accent?: boolean;
  borderAccent?: "yellow" | "orange" | "blue";
}) {
  return (
    <Card className={borderColors[borderAccent]}>
      <p className="text-gray-400 text-sm mb-2">{label}</p>
      <h2 className={`text-4xl font-technical font-bold ${accent ? "text-white" : ""}`}>
        {/* A zero while the count is still in flight is indistinguishable from
            a real zero, and the dashboard showing four confident zeros it had
            not measured is the bug this replaced. An em dash cannot be
            mistaken for a number. */}
        {value === null ? <span className="text-zinc-600">&mdash;</span> : value}
      </h2>
    </Card>
  );
}