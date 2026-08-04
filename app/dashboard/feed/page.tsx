"use client";

import { useRouter } from "next/navigation";
import { usePosts } from "@/hooks/usePosts";
import { usePostReactions } from "@/hooks/usePostReactions";
import { usePublicAds } from "@/hooks/usePublicAds";
import { CreatePostForm } from "@/components/feed/CreatePostForm";
import { PostCard } from "@/components/feed/PostCard";
import { AdBanner } from "@/components/jobs/AdBanner";
import { FeedAdCard } from "@/components/ads/FeedAdCard";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import { useState } from "react";

const FEED_AD_INTERVAL = 5;

export default function FeedPage() {
  const router = useRouter();
  const { posts, loading, userId, createPost, deletePost } = usePosts();
  const { summaries, react } = usePostReactions(posts.map((p) => p.id));
  const { ads } = usePublicAds("feed");

  const [previewUserId, setPreviewUserId] = useState<string | null>(null);

  function handleViewProfile(targetUserId: string) {
    if (targetUserId === userId) {
      router.push("/dashboard/profile");
      return;
    }
    setPreviewUserId(targetUserId);
  }

  const topBannerAd = ads[0] || null;
  const bottomBannerAd = ads.length > 1 ? ads[ads.length - 1] : ads[0] || null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-5xl font-bold text-white mb-8">Community Feed</h1>

      {topBannerAd && <AdBanner ad={topBannerAd} />}

      <CreatePostForm onCreate={createPost} />

      {loading ? (
        <p className="text-gray-400">Loading feed...</p>
      ) : posts.length === 0 ? (
        <p className="text-gray-400">No posts yet. Be the first to share something!</p>
      ) : (
        <div className="space-y-5">
          {posts.map((post, index) => {
            const showAdAfterThis =
              ads.length > 0 &&
              (index + 1) % FEED_AD_INTERVAL === 0 &&
              index !== posts.length - 1;

            const feedAd = showAdAfterThis
              ? ads[Math.floor(index / FEED_AD_INTERVAL) % ads.length]
              : null;

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
                {feedAd && (
                  <div className="mt-5">
                    <FeedAdCard ad={feedAd} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {bottomBannerAd && (
        <div className="mt-8">
          <AdBanner ad={bottomBannerAd} />
        </div>
      )}

      {previewUserId && (
        <ProfilePreviewModal userId={previewUserId} onClose={() => setPreviewUserId(null)} />
      )}
    </div>
  );
}