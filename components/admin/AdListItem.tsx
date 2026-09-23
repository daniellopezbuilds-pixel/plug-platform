"use client";

import { useState } from "react";
import { getAdPublicUrl } from "@/lib/ads";
import type { Ad } from "@/hooks/useAds";
import { EditAdForm } from "@/components/admin/EditAdForm";
import { useConfirm } from "@/components/ui/ConfirmDialog";

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
      placement: "jobs_board" | "marketplace" | "feed";
      image_path?: string;
      start_date?: string | null;
      end_date?: string | null;
      is_paid_ad?: boolean;
      payment_status?: string;
      amount_charged?: number | null;
    }
  ) => Promise<{ error: string | null }>;
}) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();

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

  const placementLabel =
    ad.placement === "jobs_board"
      ? "Jobs Board"
      : ad.placement === "marketplace"
      ? "Marketplace"
      : "Feed";

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
          {placementLabel}
          {ad.link_url && (
            <span>
              {" "}
              · <a href={ad.link_url} target="_blank" rel="noopener noreferrer" className="text-accent-2-soft hover:text-white">{ad.link_url}</a>
            </span>
          )}
        </p>
      </div>

      <span
        className={`px-3 py-1 rounded-full text-xs font-semibold ${
          ad.is_active
            ? "bg-accent/10 text-accent border border-accent/60"
            : "bg-zinc-800 text-gray-400 border border-zinc-700"
        }`}
      >
        {ad.is_active ? "Active" : "Inactive"}
      </span>

      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="border border-zinc-700 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-900 transition"
        >
          Edit
        </button>
        <button
          onClick={async () => {
            // Activating is harmless; taking a running ad down is not.
            if (ad.is_active) {
              const ok = await confirm({
                title: `Deactivate “${ad.title}”?`,
                body: "It stops showing immediately. You can activate it again.",
                confirmLabel: "Deactivate ad",
              });
              if (!ok) return;
            }
            onToggleActive(ad.id, ad.is_active);
          }}
          className="border border-zinc-700 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-900 transition"
        >
          {ad.is_active ? "Deactivate" : "Activate"}
        </button>
        <button
          onClick={async () => {
            const ok = await confirm({
              title: `Delete “${ad.title}”?`,
              body: "The listing is removed for good. A paid campaign is not refunded by this.",
              confirmLabel: "Delete ad",
            });
            if (ok) onDelete(ad.id);
          }}
          className="bg-rose-950 text-rose-400 border border-rose-800 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-rose-900 transition"
        >
          Delete
        </button>
      </div>
    </div>
  );
}