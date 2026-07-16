import { StatCard } from "./StatCard";

export type StatItem = {
  label: string;
  value: string | number;
  accent?: boolean;
  borderAccent?: "yellow" | "orange" | "blue";
};

const defaultCycle: Array<"yellow" | "orange" | "blue"> = ["yellow", "orange", "blue"];

export function StatsRow({ stats }: { stats: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
      {stats.map((stat, i) => (
        <StatCard
          key={stat.label}
          {...stat}
          borderAccent={stat.borderAccent || defaultCycle[i % defaultCycle.length]}
        />
      ))}
    </div>
  );
}