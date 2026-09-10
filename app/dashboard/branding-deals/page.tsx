"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase";
import { useAds } from "@/hooks/useAds";
import {
  AD_SPEC_TEXT,
  getAdPublicUrl,
  uploadAdImage,
  validateAdImage,
} from "@/lib/ads";
import { PageHeading } from "@/components/layout/PageHeading";
import { AdSubmissionSkeleton } from "@/components/ui/Skeleton";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { Spinner } from "@/components/ui/Spinner";
import { SectionHeading } from "@/components/ui/SectionHeading";

// Edit this list to change the city options.
const CALIFORNIA_CITIES = [
  "All of California",
  "Los Angeles",
  "San Diego",
  "San Jose",
  "San Francisco",
  "Fresno",
  "Sacramento",
  "Long Beach",
  "Oakland",
  "Bakersfield",
  "Anaheim",
  "Santa Ana",
  "Riverside",
  "Stockton",
  "Irvine",
  "Chula Vista",
  "Fremont",
  "San Bernardino",
  "Modesto",
  "Fontana",
  "Oxnard",
] as const;

// Values match sponsored_listings.placement exactly — these are the three
// surfaces that render ads today.
const PLACEMENTS = [
  { value: "feed", label: "Feed" },
  { value: "jobs_board", label: "Job board" },
  { value: "marketplace", label: "Marketplace" },
] as const;

type PlacementKey = (typeof PLACEMENTS)[number]["value"];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-zinc-800/60 border-zinc-700 text-gray-300",
  approved: "bg-green-950/40 border-green-800 text-green-400",
  rejected: "bg-rose-950/40 border-rose-900 text-rose-400",
};

const inputClass =
  "w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-accent focus:outline-none transition";

/**
 * A value the form computes or fixes, shown in a field position but not
 * editable — State (always California) and Total (budget x days).
 *
 * Deliberately has NO box. Both of these previously used the same
 * rounded/bordered/dark-filled treatment as the real inputs and differed only
 * by one shade of border, so they read as inputs that would not accept typing.
 * Removing the chrome entirely is unambiguous in a way that restyling it is
 * not.
 *
 * py-2.5 matches the inputs' padding so the value sits on the same baseline as
 * the fields beside it in a grid row.
 */
function ReadOnlyField({
  label,
  value,
  hint,
  large = false,
}: {
  label: string;
  value: string;
  hint?: string;
  large?: boolean;
}) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <p
        className={`py-2.5 font-semibold text-white ${large ? "text-xl" : ""}`}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-gray-500 -mt-1">{hint}</p>}
    </div>
  );
}

const labelClass = "block text-sm text-gray-400 mb-1";

/** Rows fetched per request as the submissions panel is scrolled. */
const SUBMISSIONS_PAGE_SIZE = 5;

export default function BrandingDealsPage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Own brand submissions only. Without the source filter this also picked up
  // house and job ads; without skip it ran one unfiltered query before userId
  // resolved and briefly listed every approved ad on the platform.
  const { ads, loading, loadingMore, hasMore, loadMore, createBrandAd } = useAds({
    submittedBy: userId,
    source: "brand",
    skip: !userId,
    pageSize: SUBMISSIONS_PAGE_SIZE,
  });

  // Infinite scroll inside the submissions panel: a sentinel at the end of the
  // list, watched against the panel itself rather than the viewport, so it
  // triggers on the panel's own scrollbar.
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = listRef.current;
    if (!sentinel || !root || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root, rootMargin: "120px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const today = new Date().toISOString().split("T")[0];
  const defaultEnd = new Date();
  defaultEnd.setDate(defaultEnd.getDate() + 30);

  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [placement, setPlacement] = useState<PlacementKey>("feed");
  const [city, setCity] = useState<string>(CALIFORNIA_CITIES[0]);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd.toISOString().split("T")[0]);
  const [dailyBudget, setDailyBudget] = useState("");
  const [runDays, setRunDays] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const budgetNumber = Number(dailyBudget);
  const daysNumber = Number(runDays);
  const total =
    Number.isFinite(budgetNumber) && Number.isFinite(daysNumber)
      ? Math.round(budgetNumber * daysNumber)
      : 0;

  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Same validator the admin form uses, so an off-spec image never reaches
  // storage from either path.
  async function handleFileChange(selected: File | null) {
    clearError("image");
    setFileInfo(null);

    if (!selected) {
      setFile(null);
      return;
    }

    const { error, width, height } = await validateAdImage(selected);

    if (error) {
      setFile(null);
      setErrors((prev) => ({ ...prev, image: error }));
      setFileInputKey((k) => k + 1);
      return;
    }

    setFile(selected);
    setFileInfo(`${width}×${height}px — looks good`);
  }

  function validate() {
    const next: Record<string, string> = {};

    if (!title.trim()) next.title = "Ad title is required.";
    if (!city) next.city = "Choose a city.";
    if (!startDate || !endDate) next.dates = "Start and end dates are required.";
    else if (endDate < startDate) next.dates = "End date must be on or after the start date.";

    if (!dailyBudget.trim()) next.daily_budget = "Daily budget is required.";
    else if (!Number.isFinite(budgetNumber) || budgetNumber <= 0)
      next.daily_budget = "Enter a daily budget greater than 0.";

    if (!runDays.trim()) next.run_days = "Run length is required.";
    else if (!Number.isInteger(daysNumber) || daysNumber <= 0)
      next.run_days = "Enter a whole number of days greater than 0.";

    if (!file) next.image = "A valid ad image is required.";

    return next;
  }

  async function handleSubmit() {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (!userId || !file) return;

    setSubmitting(true);

    const { error: uploadError, path } = await uploadAdImage(file);

    if (uploadError || !path) {
      setSubmitting(false);
      setErrors({ image: uploadError || "Image upload failed." });
      return;
    }

    const { error } = await createBrandAd({
      title: title.trim(),
      image_path: path,
      link_url: linkUrl.trim(),
      placement,
      city,
      start_date: startDate,
      end_date: endDate,
      daily_budget: budgetNumber,
      run_days: daysNumber,
      submitted_by: userId,
    });

    setSubmitting(false);

    if (error) {
      setErrors({ submit: error });
      return;
    }

    setTitle("");
    setLinkUrl("");
    setPlacement("feed");
    setCity(CALIFORNIA_CITIES[0]);
    setStartDate(today);
    setEndDate(defaultEnd.toISOString().split("T")[0]);
    setDailyBudget("");
    setRunDays("");
    setFile(null);
    setFileInfo(null);
    setFileInputKey((k) => k + 1);
    setErrors({});
  }

  const placementLabel = (v: string) =>
    PLACEMENTS.find((p) => p.value === v)?.label ?? v;

  return (
    // The width cap that used to be here is gone: the dashboard layout now
    // centres a 1200px column for every page, so a per-page max-width only
    // made this one narrower and left-aligned inside it.
    <div>
      <PageHeading title="Branding deals" />

      <p className="text-sm text-gray-400 bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-6">
        Every campaign is reviewed before it runs. Submissions start as{" "}
        <span className="text-white">Pending</span> and stay off the site
        until an admin approves them.
      </p>

      {/* Proportional rather than a fixed sidebar width, so both columns grow
          with the page instead of the right one staying narrow. Stacks below
          xl: at lg the content area is only ~768px, which squeezes both
          columns rather than reading as two. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-6 items-start">
        <div>
          <SectionHeading>New advertisement</SectionHeading>

          <Card>
          {/* @container: every grid below reflows against this card's width,
              not the viewport's. See the note on the column grid above. */}
          <div className="@container space-y-4">
            {/* Ad title, Link URL and the file input never share a row:
                they hold long free text and truncate badly at half width. */}
            <div>
              <label htmlFor="title" className={labelClass}>Ad title</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearError("title");
                }}
                className={inputClass}
              />
              {errors.title && <p className="text-xs text-rose-400 mt-1">{errors.title}</p>}
            </div>

            <div>
              <label htmlFor="link_url" className={labelClass}>
                Link URL <span className="text-gray-400">— optional</span>
              </label>
              <input
                id="link_url"
                type="text"
                placeholder="yourbrand.com/offer"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className={inputClass}
              />
            </div>

          <div className="grid grid-cols-1 @xs:grid-cols-2 @lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="placement" className={labelClass}>Placement</label>
              <select
                id="placement"
                value={placement}
                onChange={(e) => setPlacement(e.target.value as PlacementKey)}
                className={inputClass}
              >
                {PLACEMENTS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <ReadOnlyField label="State" value="California" />

            <div>
              <label htmlFor="city" className={labelClass}>City</label>
              <select
                id="city"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  clearError("city");
                }}
                className={inputClass}
              >
                {CALIFORNIA_CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {errors.city && <p className="text-xs text-rose-400 mt-1">{errors.city}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 @xs:grid-cols-2 gap-4">
            <div>
              <label htmlFor="start_date" className={labelClass}>Start date</label>
              <input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  clearError("dates");
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="end_date" className={labelClass}>End date</label>
              <input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  clearError("dates");
                }}
                className={inputClass}
              />
            </div>
          </div>
          {errors.dates && <p className="text-xs text-rose-400 -mt-2">{errors.dates}</p>}

          <div className="grid grid-cols-1 @xs:grid-cols-2 @lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="daily_budget" className={labelClass}>Daily budget</label>
              <input
                id="daily_budget"
                type="number"
                min="0"
                value={dailyBudget}
                onChange={(e) => {
                  setDailyBudget(e.target.value);
                  clearError("daily_budget");
                }}
                className={inputClass}
              />
              {errors.daily_budget && (
                <p className="text-xs text-rose-400 mt-1">{errors.daily_budget}</p>
              )}
            </div>

            <div>
              <label htmlFor="run_days" className={labelClass}>Run length (days)</label>
              <input
                id="run_days"
                type="number"
                min="0"
                value={runDays}
                onChange={(e) => {
                  setRunDays(e.target.value);
                  clearError("run_days");
                }}
                className={inputClass}
              />
              {errors.run_days && (
                <p className="text-xs text-rose-400 mt-1">{errors.run_days}</p>
              )}
            </div>

            <ReadOnlyField
              label="Total"
              value={`${total.toLocaleString()}`}
              hint="Daily budget x run length"
              large
            />
          </div>

          <div>
            <label htmlFor="ad_image" className={labelClass}>Ad image</label>
            <p className="text-xs text-gray-400 mb-1.5">{AD_SPEC_TEXT}</p>
            {/* Not inputClass. The native button is styled through file:*
                so it matches the rest of the form in every browser, and
                min-w-0 + w-full keep a long filename inside the card instead
                of widening it.

                text-sm here despite the 16px rule elsewhere: that rule exists
                because iOS Safari zooms when a field takes keyboard focus, and
                a file input opens the photo picker instead. Nothing to zoom
                into, and the smaller text is what fits a filename at 295px. */}
            <input
              id="ad_image"
              key={fileInputKey}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              className="block w-full min-w-0 p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-gray-300 focus:border-accent focus:outline-none transition file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700"
            />
            {errors.image && <p className="text-xs text-rose-400 mt-1">{errors.image}</p>}
            {fileInfo && <p className="text-xs text-green-400 mt-1">✓ {fileInfo}</p>}
          </div>

          {errors.submit && (
            <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900 rounded-lg p-3">
              {errors.submit}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !userId}
            className="bg-accent text-on-accent px-5 py-2.5 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <ButtonSpinner active={submitting} />
            {submitting ? "Submitting..." : "Submit for review"}
          </button>
        </div>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-0">
          <SectionHeading>Your submissions</SectionHeading>

          {loading ? (
            <AdSubmissionSkeleton />
          ) : ads.length === 0 ? (
            <p className="text-gray-400">Nothing submitted yet.</p>
          ) : (
            // No max-height below xl: there the column is stacked under the
            // form in normal page flow, and capping it would nest a scroll
            // area inside the page scroll for no reason. From xl the column is
            // sticky beside the form, and the cap is what keeps it inside the
            // viewport — dvh rather than vh so mobile browser chrome is
            // accounted for, and 7rem covers the heading above it plus a gap
            // at the bottom.
            <div
              ref={listRef}
              className="xl:max-h-[calc(100dvh-7rem)] overflow-y-auto scrollbar-dark pr-1 space-y-3"
            >
              {ads.map((ad) => (
                <Card key={ad.id} className="p-4">
                  <img
                    src={getAdPublicUrl(ad.image_path)}
                    alt={ad.title}
                    // Capped so a wide column doesn't turn each row into a
                    // banner; the 4:1 box still governs at narrower widths.
                    className="w-full aspect-[4/1] max-h-28 rounded object-cover border border-zinc-700 mb-3"
                  />

                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="font-semibold text-white truncate">
                      {ad.title}
                    </h3>
                    <span
                      className={`shrink-0 text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                        STATUS_STYLES[ad.status] ??
                        "bg-zinc-800 border-zinc-700 text-gray-400"
                      }`}
                    >
                      {ad.status}
                    </span>
                  </div>

                  <p className="text-xs text-gray-400">
                    {placementLabel(ad.placement)}
                    {ad.city ? ` · ${ad.city}` : ""}
                  </p>
                  {ad.start_date && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ad.start_date} → {ad.end_date}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {ad.amount_charged != null
                      ? `$${Number(ad.amount_charged).toLocaleString()} total`
                      : "—"}
                    {ad.status === "pending" && " · not running yet"}
                    {ad.status === "approved" &&
                      (ad.is_active ? " · live" : " · approved, paused")}
                  </p>

                  {ad.status === "rejected" && (
                    <div className="mt-2.5 rounded-lg border border-rose-900 bg-rose-950/30 p-2.5">
                      <p className="text-xs font-semibold text-rose-400 mb-1">
                        Why this was rejected
                      </p>
                      <p className="text-xs text-gray-300">
                        {ad.review_notes?.trim() ||
                          "No reason was recorded. Contact support if you need detail."}
                      </p>
                    </div>
                  )}
                </Card>
              ))}

              {/* Watched by the observer above; scrolling it into view fetches
                  the next page. */}
              <div ref={sentinelRef} aria-hidden />

              {loadingMore && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Spinner size="sm" label="" />
                  <span className="text-xs text-gray-400">Loading more</span>
                </div>
              )}
              {!hasMore && ads.length > SUBMISSIONS_PAGE_SIZE && (
                <p className="text-xs text-gray-400 text-center py-2">
                  That&apos;s everything.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
