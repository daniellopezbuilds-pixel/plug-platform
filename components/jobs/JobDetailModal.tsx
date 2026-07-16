import { UnionBadge } from "@/components/ui/UnionBadge";
import type { Job } from "@/hooks/useJobs";

export function JobDetailModal({
  job,
  hasApplied,
  isApplying,
  onApply,
  onClose,
}: {
  job: Job;
  hasApplied: boolean;
  isApplying: boolean;
  onApply: (jobId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-2xl font-bold text-white">{job.title}</h2>
          {job.required_union_status && (
            <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold whitespace-nowrap ml-3">
              {job.required_union_status === "union" ? "Union Required" : "Non-Union Required"}
            </span>
          )}
        </div>

        {job.company && <p className="text-gray-400 mt-1">{job.company}</p>}

        <div className="flex flex-wrap gap-3 mt-4 mb-4">
          {job.location && (
            <span className="bg-zinc-800 text-gray-300 px-3 py-1.5 rounded-full text-sm">
              📍 {job.location}
            </span>
          )}
          {job.pay && (
            <span className="bg-green-950 text-green-400 border border-green-800 px-3 py-1.5 rounded-full text-sm font-semibold">
              {job.pay}
            </span>
          )}
        </div>

        {job.description && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Job Description & Qualifications</h3>
            <p className="text-zinc-300 whitespace-pre-line">{job.description}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => onApply(job.id)}
            disabled={hasApplied || isApplying}
            className={`flex-1 px-5 py-3 rounded-lg font-semibold transition ${
              hasApplied
                ? "bg-zinc-800 text-gray-400 cursor-not-allowed"
                : isApplying
                ? "bg-zinc-700 text-gray-300 cursor-wait"
                : "bg-white text-black hover:bg-gray-200"
            }`}
          >
            {hasApplied ? "Applied ✓" : isApplying ? "Applying..." : "Apply Now"}
          </button>
          <button
            onClick={onClose}
            className="bg-zinc-800 text-gray-300 px-5 py-3 rounded-lg font-semibold hover:bg-zinc-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}