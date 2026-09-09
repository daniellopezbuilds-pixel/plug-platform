"use client";

import { useRouter } from "next/navigation";
import { usePosts } from "@/hooks/usePosts";
import { usePostReactions } from "@/hooks/usePostReactions";
import { usePublicAds } from "@/hooks/usePublicAds";
import { CreatePostForm } from "@/components/feed/CreatePostForm";
import { PostCard } from "@/components/feed/PostCard";
import { FeedAdCard } from "@/components/ads/FeedAdCard";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import { useState } from "react";

// The feed's single ad slot: one card after the 3rd post. Needs 4+ posts for
// that to be a real mid-stream position — below that the slot moves to the top
// of the stream. The old version indexed into the post list, so an empty feed
// rendered no ad at all and a paid placement served nothing.
const FEED_AD_AFTER_INDEX = 2;
const FEED_AD_MIN_POSTS = FEED_AD_AFTER_INDEX + 2;

export default function FeedPage() {
  const router = useRouter();
  const { posts, loading, userId, createPost, deletePost } = usePosts();
  const { summaries, react } = usePostReactions(posts.map((p) => p.id));
  const { ad, adIndex, adCount, selectAd } = usePublicAds("feed");

  const [previewUserId, setPreviewUserId] = useState<string | null>(null);

  function handleViewProfile(targetUserId: string) {
    if (targetUserId === userId) {
      router.push("/dashboard/profile");
      return;
    }
    setPreviewUserId(targetUserId);
  }

  // Exactly one of these is true whenever there's an ad, so the slot renders
  // once and only once.
  const adInStream = ad !== null && posts.length >= FEED_AD_MIN_POSTS;
  const adAtTop = ad !== null && posts.length < FEED_AD_MIN_POSTS;

  return (
    <div className="max-w-2xl">
      <h1 className="text-5xl font-bold text-white mb-8">Community Feed</h1>

      <CreatePostForm onCreate={createPost} />

      {/* Short or empty feed: the slot sits at the top of the stream so an
          approved ad always appears somewhere. */}
      {adAtTop && ad && (
        <div className="mb-5">
          <FeedAdCard
            ad={ad}
            index={adIndex}
            total={adCount}
            onSelect={selectAd}
          />
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading feed...</p>
      ) : posts.length === 0 ? (
        <p className="text-gray-400">No posts yet. Be the first to share something!</p>
      ) : (
        <div className="space-y-5">
          {posts.map((post, index) => {
            const showAdAfterThis = adInStream && index === FEED_AD_AFTER_INDEX;

            return (
              <div key={post.id}>
                <PostCard
                  post={post}
                  currentUserId={userId}
                  reactionSummary={
                    summaries[post.id] || {
                      counts: { like: 0, celebrate: 0, support: 0, insightful: 0 },
                      total: 0,
                      userReaction: null,
                      reactors: [],
                    }
                  }
                  onReact={(reactionType) => react(post.id, reactionType)}
                  onDelete={deletePost}
                  onViewProfile={handleViewProfile}
                />
                {showAdAfterThis && ad && (
                  <div className="mt-5">
                    <FeedAdCard
                      ad={ad}
                      index={adIndex}
                      total={adCount}
                      onSelect={selectAd}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewUserId && (
        <ProfilePreviewModal userId={previewUserId} onClose={() => setPreviewUserId(null)} />
      )}
    </div>
  );
}