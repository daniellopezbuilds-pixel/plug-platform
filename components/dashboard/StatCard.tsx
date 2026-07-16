import { Card } from "@/components/ui/Card";

const borderColors: Record<string, string> = {
  yellow: "border-t-2 border-t-yellow-400",
  orange: "border-t-2 border-t-orange-500",
  blue: "border-t-2 border-t-blue-500",
};

export function StatCard({
  label,
  value,
  accent = false,
  borderAccent = "yellow",
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  borderAccent?: "yellow" | "orange" | "blue";
}) {
  return (
    <Card className={borderColors[borderAccent]}>
      <p className="text-gray-400 text-sm mb-2">{label}</p>
      <h2 className={`text-4xl font-technical font-bold ${accent ? "text-yellow-400" : ""}`}>
        {value}
      </h2>
    </Card>
  );
}