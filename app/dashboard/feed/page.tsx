"use client";

import { useRouter } from "next/navigation";
import { usePosts } from "@/hooks/usePosts";
import { usePostReactions } from "@/hooks/usePostReactions";
import { CreatePostForm } from "@/components/feed/CreatePostForm";
import { PostCard } from "@/components/feed/PostCard";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import { PageHeading } from "@/components/layout/PageHeading";
import { PageWithRail } from "@/components/layout/PageWithRail";
import { SponsoredRail } from "@/components/ads/SponsoredRail";
import { useState } from "react";
import { PostSkeleton } from "@/components/ui/Skeleton";

export default function FeedPage() {
  const router = useRouter();
  const { posts, loading, userId, createPost, deletePost } = usePosts();
  const { summaries, react } = usePostReactions(posts.map((p) => p.id));

  const [previewUserId, setPreviewUserId] = useState<string | null>(null);

  function handleViewProfile(targetUserId: string) {
    if (targetUserId === userId) {
      router.push("/dashboard/profile");
      return;
    }
    setPreviewUserId(targetUserId);
  }

  return (
    <div>
      <PageHeading title="Community Feed" />

      {/*
        The ad used to live in the stream: a card after the third post, or at
        the top of a short feed. Both are gone — the slot is in the rail now,
        like every other page, so it is not interleaved with people's posts and
        the post list no longer reflows when an ad arrives.

        This also removed FEED_AD_AFTER_INDEX / FEED_AD_MIN_POSTS and the
        adInStream / adAtTop pair that existed only to place it.
      */}
      <PageWithRail rail={<SponsoredRail placement="feed" />}>
        {/* Capped to a reading measure while the rail is stacked above and
            this column is full width. From xl the rail sits beside it and
            already constrains the column, so the cap is dropped. */}
        <div className="max-w-2xl xl:max-w-none">
          <CreatePostForm onCreate={createPost} />

          {loading ? (
            <PostSkeleton />
          ) : posts.length === 0 ? (
            <p className="text-gray-400">
              No posts yet. Be the first to share something!
            </p>
          ) : (
            <div className="space-y-5">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
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
              ))}
            </div>
          )}
        </div>
      </PageWithRail>

      {previewUserId && (
        <ProfilePreviewModal
          userId={previewUserId}
          onClose={() => setPreviewUserId(null)}
        />
      )}
    </div>
  );
}
