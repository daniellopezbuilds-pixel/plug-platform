"use client";

import type { ConversationSummary } from "@/hooks/useConversations";

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  function displayName(conv: ConversationSummary) {
    if (conv.is_group) {
      return conv.title || conv.participants.map((p) => p.full_name || "Unknown").join(", ");
    }
    return conv.participants[0]?.full_name || "Unknown";
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (confirm("Delete this conversation from your inbox? It will reappear if you get a new message.")) {
      onDelete(id);
    }
  }

  if (conversations.length === 0) {
    return <p className="text-gray-400 text-sm p-4">No conversations yet.</p>;
  }

  return (
    <div className="space-y-1">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={`group relative rounded-lg transition ${
            activeId === conv.id ? "bg-zinc-800" : "hover:bg-zinc-900"
          }`}
        >
          <button
            onClick={() => onSelect(conv.id)}
            className="w-full text-left p-4 flex items-start gap-2"
          >
            {conv.isUnread && (
              <span className="w-2 h-2 rounded-full bg-yellow-400 mt-2 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1 pr-6">
              <p className={`truncate ${conv.isUnread ? "font-bold text-white" : "font-semibold text-white"}`}>
                {displayName(conv)}
              </p>
              {conv.lastMessage && (
                <p
                  className={`text-sm truncate mt-1 ${
                    conv.isUnread ? "text-white font-semibold" : "text-gray-400"
                  }`}
                >
                  {conv.lastMessage.deleted_at ? "Message deleted" : conv.lastMessage.content}
                </p>
              )}
            </div>
          </button>

          <button
            onClick={(e) => handleDelete(e, conv.id)}
            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition text-xs text-gray-500 hover:text-red-400"
            title="Delete conversation"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}