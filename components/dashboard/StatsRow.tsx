import { StatCard } from "./StatCard";

export type StatItem = {
  label: string;
  /** null while the count is still loading — StatCard renders a dash. */
  value: string | number | null;
  accent?: boolean;
  borderAccent?: "yellow" | "orange" | "blue";
};

const defaultCycle: Array<"yellow" | "orange" | "blue"> = ["yellow", "orange", "blue"];

export function StatsRow({ stats }: { stats: StatItem[] }) {
  return (
    // Four across from xl, not lg. At exactly 1024 the sidebar stops being a
    // drawer and takes its 256px back, so the content area is at its narrowest
    // desktop width (~688px) at the same breakpoint — four cards there were
    // about 154px each, too narrow for a label like "Applications". Two rows of
    // two until there is room for one row of four.
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
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