export function RoleSwitch({
  activeRole,
  onSwitch,
}: {
  activeRole: string;
  onSwitch: (role: "worker" | "employer") => void;
}) {
  return (
    <div className="flex gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
      {(["worker", "employer"] as const).map((role) => (
        <button
          key={role}
          onClick={() => onSwitch(role)}
          className={`flex-1 rounded-md py-2 text-sm font-semibold capitalize transition ${
            activeRole === role
              ? "bg-yellow-400 text-black"
              : "text-gray-400 hover:text-white"
          }`}
        >
          {role}
        </button>
      ))}
    </div>
  );
}