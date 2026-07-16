export function EmployerVerifiedBadge({ verified }: { verified: boolean }) {
  if (!verified) return null;

  return (
    <span className="inline-flex items-center gap-1 bg-green-950 text-green-400 border border-green-800 px-3 py-1 rounded-full text-sm font-semibold">
      ✓ Verified Employer
    </span>
  );
}