"use client";

import { useRouter } from "next/navigation";
import { usePosts } from "@/hooks/usePosts";
import { LoadMore } from "@/components/ui/LoadMore";
import { usePostReactions } from "@/hooks/usePostReactions";
import { usePublicAds } from "@/hooks/usePublicAds";
import { CreatePostForm } from "@/components/feed/CreatePostForm";
import { PostCard } from "@/components/feed/PostCard";
import {
  NewMembersCard,
  ProfileSummaryCard,
  RecentJobsCard,
} from "@/components/feed/FeedRail";
import { SponsoredRail } from "@/components/ads/SponsoredRail";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import { PageHeading } from "@/components/layout/PageHeading";
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListError } from "@/components/ui/ListError";
import { useState } from "react";
import { PostSkeleton } from "@/components/ui/Skeleton";

/**
 * The feed.
 *
 * WHAT WAS WRONG WITH THE LAYOUT. The post column was capped at 720px and
 * centred, with the sponsored slot as the only thing in a 320px rail beside
 * it — so at any desktop width the page was a narrow strip of posts, one small
 * advert, and a lot of black. The rail now holds things worth its width (see
 * components/feed/FeedRail.tsx), and the columns fill the content area
 * instead of floating in the middle of it.
 *
 * THREE LAYOUTS, chosen by width:
 *
 *   under 1280    one column: heading, the sponsored slot, composer, posts.
 *                 The rail cards are not mounted at all — on a phone they
 *                 would push the posts down, and a hidden card still fetches.
 *   1280-1719     posts | rail (sponsored, your profile, new jobs, new members)
 *   1720 and up   you | posts | rail. The rail is split across both sides so
 *                 neither column runs out of content halfway down the screen.
 *
 * Rails are sticky and scroll on their own when taller than the window — see
 * components/layout/RailColumns.tsx, which also owns the breakpoints.
 *
 * THE SPONSORED SLOT is queried once, here, and rendered in exactly one place
 * for the current width. usePublicAds records impressions itself, so moving
 * the card between positions does not double-count anything.
 */
export default function FeedPage() {
  const router = useRouter();
  const {
    posts,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    userId,
    createPost,
    deletePost,
    error: postsError,
    reload: reloadPosts,
  } = usePosts();
  const { summaries, react } = usePostReactions(posts.map((p) => p.id));
  const { ad, adIndex, adCount, selectAd, loading: adLoading } = usePublicAds("feed");

  const { withRail, split } = useRailBreakpoints();

  const [previewUserId, setPreviewUserId] = useState<string | null>(null);

  function handleViewProfile(targetUserId: string) {
    if (targetUserId === userId) {
      router.push("/dashboard/profile");
      return;
    }
    setPreviewUserId(targetUserId);
  }

  const sponsored = (
    <SponsoredRail
      ad={ad}
      index={adIndex}
      total={adCount}
      onSelect={selectAd}
      loading={adLoading}
    />
  );

  return (
    <>
      <RailColumns
        withRail={withRail}
        split={split}
        // Posts are prose; past ~800px lines get too long to read. The rails
        // take the extra width instead.
        mainMax={800}
        leftLabel="Your profile and people"
        left={
          <>
            <ProfileSummaryCard />
            <NewMembersCard onViewProfile={handleViewProfile} />
          </>
        }
        rightLabel="Sponsored and suggestions"
        right={
          <>
            {sponsored}
            {!split && <ProfileSummaryCard />}
            <RecentJobsCard />
            {!split && <NewMembersCard onViewProfile={handleViewProfile} />}
          </>
        }
      >
          <PageHeading title="Community Feed" size="compact" />
  
          {!withRail && <div className="mb-4 empty:hidden">{sponsored}</div>}
  
          <div className="mb-4">
            <CreatePostForm onCreate={createPost} />
          </div>
  
          {loading ? (
            <PostSkeleton />
          ) : postsError ? (
            <ListError what="the feed" message={postsError} onRetry={reloadPosts} />
          ) : posts.length === 0 ? (
            <EmptyState icon="chat" title="No posts yet">
              Share an update or a job opportunity to get the conversation
              started.
            </EmptyState>
          ) : (
            <div className="space-y-3">
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
  
              <LoadMore
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                endMessage="You're all caught up."
              />
            </div>
          )}
      </RailColumns>

      {previewUserId && (
        <ProfilePreviewModal
          userId={previewUserId}
          onClose={() => setPreviewUserId(null)}
        />
      )}
    </>
  );
}
