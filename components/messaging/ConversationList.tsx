import type { ConversationSummary } from "@/hooks/useConversations";

export function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  function displayName(conv: ConversationSummary) {
    if (conv.is_group) {
      return conv.title || conv.participants.map((p) => p.full_name || "Unknown").join(", ");
    }
    return conv.participants[0]?.full_name || "Unknown";
  }

  if (conversations.length === 0) {
    return <p className="text-gray-400 text-sm p-4">No conversations yet.</p>;
  }

  return (
    <div className="space-y-1">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={`w-full text-left p-4 rounded-lg transition flex items-start gap-2 ${
            activeId === conv.id ? "bg-zinc-800" : "hover:bg-zinc-900"
          }`}
        >
          {conv.isUnread && (
            <span className="w-2 h-2 rounded-full bg-yellow-400 mt-2 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className={`truncate ${conv.isUnread ? "font-bold text-white" : "font-semibold text-white"}`}>
              {displayName(conv)}
            </p>
            {conv.lastMessage && (
              <p
                className={`text-sm truncate mt-1 ${
                  conv.isUnread ? "text-white font-semibold" : "text-gray-400"
                }`}
              >
                {conv.lastMessage.content}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}