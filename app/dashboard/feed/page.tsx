"use client";

import { useRouter } from "next/navigation";
import { usePosts } from "@/hooks/usePosts";
import { usePostReactions } from "@/hooks/usePostReactions";
import { CreatePostForm } from "@/components/feed/CreatePostForm";
import { PostCard } from "@/components/feed/PostCard";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import { PageHeading } from "@/components/layout/PageHeading";
import { PageWithSponsoredRail } from "@/components/ads/PageWithSponsoredRail";
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
      {/*
        The ad used to live in the stream: a card after the third post, or at
        the top of a short feed. Both are gone — the slot is in the rail now,
        like every other page, so it is not interleaved with people's posts and
        the post list no longer reflows when an ad arrives.

        This also removed FEED_AD_AFTER_INDEX / FEED_AD_MIN_POSTS and the
        adInStream / adAtTop pair that existed only to place it.
      */}
      {/* measure="reading": the container caps at 1600, which would leave the
          post column around 1150px wide with the rail beside it. Posts are
          prose and prose does not get better at 1150px — around 720 is 85-ish
          characters, which is the top of the comfortable range. The pair is
          centred and the slack goes to the outer edges.

          The cap is passed as contentClassName, NOT wrapped around the children
          here. On the flex item it stops the column growing; on an inner div it
          only narrows the text and leaves 450px of empty column sitting against
          the rail. See the note in PageWithRail. */}
      <PageWithSponsoredRail
        placement="feed"
        heading={<PageHeading title="Community Feed" />}
        measure="reading"
        readingWidth={720}
        contentClassName="max-w-2xl mx-auto xl:mx-0"
      >
        <div>
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
      </PageWithSponsoredRail>

      {previewUserId && (
        <ProfilePreviewModal
          userId={previewUserId}
          onClose={() => setPreviewUserId(null)}
        />
      )}
    </div>
  );
}
