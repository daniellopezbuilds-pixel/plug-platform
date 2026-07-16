export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-zinc-900 rounded-xl border border-zinc-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] p-6 ${className}`}
    >
      {children}
    </div>
  );
}