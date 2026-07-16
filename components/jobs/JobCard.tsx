import { Card } from "@/components/ui/Card";
import type { Job } from "@/hooks/useJobs";

export function JobCard({
  job,
  hasApplied,
  onViewDetails,
}: {
  job: Job;
  hasApplied: boolean;
  onViewDetails: (job: Job) => void;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-2xl font-bold text-white">{job.title}</h2>
        {job.required_union_status && (
          <span className="text-xs uppercase tracking-wide text-gray-500 font-semibold whitespace-nowrap">
            {job.required_union_status === "union" ? "Union Required" : "Non-Union Required"}
          </span>
        )}
      </div>
      {job.company && <p className="text-gray-400 mt-1">{job.company}</p>}
      {job.location && <p className="text-zinc-400 mt-1">{job.location}</p>}
      {job.pay && <p className="text-green-400 font-semibold mt-2">{job.pay}</p>}

      <button
        onClick={() => onViewDetails(job)}
        className="mt-4 px-5 py-3 rounded-lg font-semibold bg-white text-black hover:bg-gray-200 transition"
      >
        {hasApplied ? "View Details (Applied ✓)" : "View Details"}
      </button>
    </Card>
  );
}