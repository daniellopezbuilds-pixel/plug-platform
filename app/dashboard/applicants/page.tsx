"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("applications")
      .select(`
        *,
        jobs (
          id,
          title,
          location,
          pay,
          description
        )
      `)
      .eq("worker_id", user.id);

    if (error) {
      console.error(error);
      return;
    }

    setApplications(data || []);
    setLoading(false);
  }

  if (loading) {
    return <p>Loading applications...</p>;
  }

  return (
    <div>
      <h1 className="text-5xl font-bold mb-8">
        My Applications
      </h1>

      {applications.length === 0 ? (
        <p>No applications yet.</p>
      ) : (
        <div className="space-y-6">
          {applications.map((application) => (
            <div
              key={application.id}
              className="border border-gray-700 rounded-lg p-6"
            >
              <h2 className="text-2xl font-bold mb-2">
                {application.jobs?.title}
              </h2>

              <p>{application.jobs?.location}</p>

              <p className="font-semibold mt-2">
                {application.jobs?.pay}
              </p>

              <p className="mt-4 text-gray-300">
                {application.jobs?.description}
              </p>

              <p className="mt-4 text-gray-400">
                Applied on{" "}
                {new Date(
                  application.created_at
                ).toLocaleDateString()}
              </p>

              <div className="mt-4">
                <span
                  className={`px-3 py-2 rounded font-semibold ${
                    application.status === "Accepted"
                      ? "bg-green-600"
                      : application.status === "Rejected"
                      ? "bg-red-600"
                      : "bg-yellow-600 text-black"
                  }`}
                >
                  Status: {application.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}