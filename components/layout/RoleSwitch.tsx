import { modeLabel, type Mode } from "@/lib/accountModes";

export function RoleSwitch({
  activeMode,
  modes,
  onSwitch,
}: {
  activeMode: string;
  modes: readonly Mode[];
  onSwitch: (mode: Mode) => void;
}) {
  // An account with one available mode has nothing to switch between. Render
  // nothing rather than a single dead button. Sidebar hides the surrounding
  // "Current Mode" block on the same condition.
  if (modes.length < 2) return null;

  return (
    <div className="flex gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
      {modes.map((mode) => (
        <button
          key={mode}
          onClick={() => onSwitch(mode)}
          className={`flex-1 rounded-md min-h-11 md:min-h-0 md:py-2 text-sm font-semibold transition ${
            activeMode === mode
              ? "bg-accent text-on-accent"
              : "text-gray-400 hover:text-white"
          }`}
        >
          {modeLabel(mode)}
        </button>
      ))}
    </div>
  );
}
