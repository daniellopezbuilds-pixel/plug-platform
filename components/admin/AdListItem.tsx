"use client";

import { useState } from "react";
import { getAdPublicUrl } from "@/lib/ads";
import type { Ad } from "@/hooks/useAds";
import { EditAdForm } from "@/components/admin/EditAdForm";

export function AdListItem({
  ad,
  onToggleActive,
  onDelete,
  onUpdate,
}: {
  ad: Ad;
  onToggleActive: (id: string, currentValue: boolean) => void;
  onDelete: (id: string) => void;
  onUpdate: (
    id: string,
    updates: {
      title: string;
      link_url: string;
      placement: "jobs_board" | "marketplace";
      image_path?: string;
    }
  ) => Promise<{ error: string | null }>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditAdForm
        ad={ad}
        onCancel={() => setEditing(false)}
        onSave={async (updates) => {
          const result = await onUpdate(ad.id, updates);
          if (!result.error) setEditing(false);
          return result;
        }}
      />
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center gap-4">
      <img
        src={getAdPublicUrl(ad.image_path)}
        alt={ad.title}
        className="w-24 h-16 rounded object-cover border border-zinc-700"
      />

      <div className="flex-1">
        <h4 className="text-white font-semibold">{ad.title}</h4>
        <p className="text-gray-400 text-sm">
          {ad.placement === "jobs_board" ? "Jobs Board" : "Marketplace"}
          {ad.link_url && (
            <span>
              {" "}
              · <a href={ad.link_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">{ad.link_url}</a>
            </span>
          )}
        </p>
      </div>

      <span
        className={`px-3 py-1 rounded-full text-xs font-semibold ${
          ad.is_active
            ? "bg-green-950 text-green-400 border border-green-800"
            : "bg-zinc-800 text-gray-500 border border-zinc-700"
        }`}
      >
        {ad.is_active ? "Active" : "Inactive"}
      </span>

      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="bg-zinc-800 text-gray-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-700 transition"
        >
          Edit
        </button>
        <button
          onClick={() => onToggleActive(ad.id, ad.is_active)}
          className="bg-zinc-800 text-gray-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-700 transition"
        >
          {ad.is_active ? "Deactivate" : "Activate"}
        </button>
        <button
          onClick={() => onDelete(ad.id)}
          className="bg-red-950 text-red-400 border border-red-800 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-red-900 transition"
        >
          Delete
        </button>
      </div>
    </div>
  );
}