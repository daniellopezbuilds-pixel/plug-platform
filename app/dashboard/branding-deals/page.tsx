"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase";
import { useAds } from "@/hooks/useAds";
import { useAdCheckout, type CapacityByPlacement } from "@/hooks/useAdCheckout";
import {
  AD_SPEC_TEXT,
  getAdPublicUrl,
  uploadAdImage,
  validateAdImage,
} from "@/lib/ads";
import {
  AD_DURATIONS_MONTHS,
  AD_PLACEMENTS,
  adEndDate,
  adPlacementLabel,
  formatUsd,
  monthlyCentsFor,
  todayIso,
  totalCentsFor,
  type AdDurationMonths,
  type AdPlacement,
} from "@/lib/adPricing";
import { PageHeading } from "@/components/layout/PageHeading";
import { AdSubmissionSkeleton } from "@/components/ui/Skeleton";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { Spinner } from "@/components/ui/Spinner";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useToast } from "@/components/ui/Toast";

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

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-zinc-800/60 border-zinc-700 text-gray-300",
  approved: "bg-green-950/40 border-green-800 text-green-400",
  rejected: "bg-rose-950/40 border-rose-900 text-rose-400",
};

const inputClass =
  "w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-accent focus:outline-none transition";

const labelClass = "block text-sm text-gray-400 mb-1";

/**
 * A value the form computes or fixes, shown in a field position but not
 * editable — State (always California), End date (start plus the term) and
 * Total (rate x months).
 *
 * Deliberately has NO box. These previously used the same rounded/bordered/
 * dark-filled treatment as the real inputs and differed only by one shade of
 * border, so they read as inputs that would not accept typing. Removing the
 * chrome entirely is unambiguous in a way that restyling it is not.
 *
 * There is more of this than there used to be, and that is the point: the
 * total is now something the brand is told, not something it proposes.
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
      <p className={`py-2.5 font-semibold text-white ${large ? "text-xl" : ""}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-gray-500 -mt-1">{hint}</p>}
    </div>
  );
}

/** Rows fetched per request as the submissions panel is scrolled. */
const SUBMISSIONS_PAGE_SIZE = 5;

/**
 * How long after returning from Stripe to re-check the submissions list.
 *
 * The redirect does not mark anything paid — the webhook does, and it arrives
 * on Stripe's schedule rather than the browser's. So the row can still read
 * 'unpaid' for a moment after a successful payment. Rather than lie about it,
 * the banner says the confirmation is landing and the list is refetched twice
 * on the way past.
 */
const POST_CHECKOUT_REFRESH_MS = [2500, 7000];

export default function BrandingDealsPage() {
  const toast = useToast();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Own brand submissions only. Without the source filter this also picked up
  // house and job ads; without skip it ran one unfiltered query before userId
  // resolved and briefly listed every approved ad on the platform.
  const { ads, loading, loadingMore, hasMore, loadMore, reload } = useAds({
    submittedBy: userId,
    source: "brand",
    skip: !userId,
    pageSize: SUBMISSIONS_PAGE_SIZE,
  });

  const { fetchCapacity, startCheckout, resumeCheckout, redirecting } =
    useAdCheckout();

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

  const today = todayIso();

  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [placement, setPlacement] = useState<AdPlacement>("feed");
  const [city, setCity] = useState<string>(CALIFORNIA_CITIES[0]);
  const [startDate, setStartDate] = useState(today);
  const [durationMonths, setDurationMonths] = useState<AdDurationMonths>(1);

  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  // Derived, not typed. The same two functions the checkout route uses, so the
  // end date stored on the row and the total charged by Stripe are the ones
  // shown here.
  const endDate = adEndDate(startDate, durationMonths);
  const totalCents = totalCentsFor(placement, durationMonths);

  // ---- Placement availability -------------------------------------------
  //
  // Read from the server, because a brand cannot see other brands'
  // paid-but-unreviewed campaigns under RLS and would therefore always count
  // too few. See lib/adCapacity.tsx.

  const [capacity, setCapacity] = useState<CapacityByPlacement | null>(null);
  const [capacityError, setCapacityError] = useState<string | null>(null);

  /**
   * Only the newest request may write to state.
   *
   * Changing the start date fires one of these per keystroke on some browsers'
   * date inputs, and they do not necessarily come back in order — without this
   * an older answer can land last and leave the form showing availability for
   * dates nobody asked about.
   */
  const capacityRequestRef = useRef(0);

  const refreshCapacity = useCallback(async () => {
    if (!userId) return;

    const requestId = ++capacityRequestRef.current;

    const { capacity: next, error } = await fetchCapacity(
      startDate,
      durationMonths
    );

    if (requestId !== capacityRequestRef.current) return;

    setCapacity(next);
    setCapacityError(error);
  }, [userId, startDate, durationMonths, fetchCapacity]);

  useEffect(() => {
    refreshCapacity();
  }, [refreshCapacity]);

  const selectedCapacity = capacity?.[placement] ?? null;
  const placementFull = selectedCapacity?.full ?? false;

  /**
   * The placement has no Stripe Price behind it, so checkout would 503.
   *
   * Only treated as unbuyable once the server has actually said so. Before the
   * first capacity response `selectedCapacity` is null and this stays false —
   * otherwise the form would flash "unavailable" on every load while the
   * request is in flight, which is a worse lie than the one being fixed.
   */
  const placementUnconfigured = selectedCapacity
    ? !selectedCapacity.configured
    : false;

  // ---- Returning from Stripe --------------------------------------------
  //
  // window.location rather than useSearchParams: this is the only thing on the
  // page that reads the query string, and useSearchParams would require a
  // Suspense boundary around the whole form to satisfy static rendering.

  const [checkoutOutcome, setCheckoutOutcome] = useState<
    "success" | "cancelled" | null
  >(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");

    if (outcome !== "success" && outcome !== "cancelled") return;

    // react-hooks/set-state-in-effect, knowingly. The value being synchronised
    // is the URL, which does not exist during the server pass, so reading it in
    // a lazy useState initialiser would render one thing on the server and
    // another on the client — a hydration mismatch traded for a lint warning.
    // An effect after mount is the correct place for a browser-only read, and
    // this one runs once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCheckoutOutcome(outcome);

    // Drop the parameter so a refresh does not re-show the banner.
    window.history.replaceState({}, "", window.location.pathname);

    if (outcome !== "success") return;

    const timers = POST_CHECKOUT_REFRESH_MS.map((ms) =>
      setTimeout(() => reload(), ms)
    );

    return () => timers.forEach(clearTimeout);
  }, [reload]);

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
    if (!startDate) next.dates = "A start date is required.";
    else if (startDate < today) next.dates = "Start date cannot be in the past.";

    if (!file) next.image = "A valid ad image is required.";

    // No budget or run-length validation any more: both are now picked from a
    // fixed set or derived, so there is no free-text number left to get wrong.

    return next;
  }

  async function handleSubmit() {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (!userId || !file) return;

    setUploading(true);

    // Availability is re-read BEFORE the upload, not after.
    //
    // The count on screen may be minutes old — it was fetched when the dates
    // were last changed, and the brand has been picking an image since. Leaving
    // the check to the checkout route would mean pushing 2MB to storage and
    // then refusing, which wastes the brand's time and leaves an orphaned
    // object in the bucket that nothing will ever collect.
    //
    // This is still not the authority. The route counts again before it writes
    // anything, because nothing stops a caller skipping the form entirely.
    const { capacity: fresh, error: freshError } = await fetchCapacity(
      startDate,
      durationMonths
    );

    if (fresh) {
      setCapacity(fresh);

      // Full, or not purchasable at all. Either way the pay button is about to
      // be replaced by the panel that explains which, so no inline error is
      // set — a red line under a button that is disappearing says less than the
      // panel taking its place.
      const state = fresh[placement];

      if (state && (state.full || !state.configured)) {
        setUploading(false);
        return;
      }
    } else if (freshError) {
      // Could not check. Carry on rather than blocking a paying customer on a
      // failed advisory read — the route will refuse if it really is full.
      setCapacityError(freshError);
    }

    // The image goes to storage next and the row is created by the checkout
    // route afterwards, so an abandoned checkout leaves an orphaned object in
    // the bucket. That is the cheaper failure: the alternative is inserting the
    // row before the upload and having a campaign whose image does not exist.
    const { error: uploadError, path } = await uploadAdImage(file);

    if (uploadError || !path) {
      setUploading(false);
      setErrors({ image: uploadError || "Image upload failed." });
      return;
    }

    const { error } = await startCheckout({
      title: title.trim(),
      linkUrl: linkUrl.trim(),
      imagePath: path,
      placement,
      city,
      startDate,
      durationMonths,
    });

    setUploading(false);

    if (error) {
      setErrors({ submit: error });
      // A 409 means someone else took the last slot while this form was open.
      refreshCapacity();
      return;
    }

    // No form reset. On success the browser is already navigating to Stripe,
    // and clearing the fields underneath would only be visible if the redirect
    // failed — at which point the brand would want their work back.
  }

  async function handleResume(listingId: string) {
    const { error } = await resumeCheckout(listingId);
    if (error) toast.error(error);
  }

  const busy = uploading || redirecting;

  return (
    // No per-page width cap: the dashboard layout centres the column for every
    // page (1600px since the widening), and the form below is already a
    // two-column grid from xl with container queries inside each column, so it
    // uses the extra width rather than stretching one field row across it.
    <div>
      <PageHeading title="Branding deals" />

      {checkoutOutcome === "success" && (
        <p className="text-sm text-green-400 bg-green-950/40 border border-green-800 rounded-lg p-3 mb-4">
          Payment received. Your campaign moves to{" "}
          <span className="text-white">Pending</span> as soon as Stripe confirms
          it — usually a few seconds — and an admin reviews it before it runs.
        </p>
      )}

      {checkoutOutcome === "cancelled" && (
        <p className="text-sm text-gray-300 bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-4">
          Checkout was cancelled and nothing was charged. Your campaign is saved
          below as <span className="text-white">Payment incomplete</span> — you
          can finish paying for it there.
        </p>
      )}

      <p className="text-sm text-gray-400 bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-6">
        Placements are sold at a flat monthly rate and paid up front. Every
        campaign is reviewed after payment and stays off the site until an admin
        approves it.
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
                <label htmlFor="title" className={labelClass}>
                  Ad title
                </label>
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
                {errors.title && (
                  <p className="text-xs text-rose-400 mt-1">{errors.title}</p>
                )}
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
                  <label htmlFor="placement" className={labelClass}>
                    Placement
                  </label>
                  <select
                    id="placement"
                    value={placement}
                    onChange={(e) => setPlacement(e.target.value as AdPlacement)}
                    className={inputClass}
                  >
                    {AD_PLACEMENTS.map((p) => {
                      const state = capacity?.[p.value] ?? null;
                      const full = state?.full ?? false;
                      const unconfigured = state ? !state.configured : false;
                      return (
                        // Disabled rather than hidden: a brand should be able
                        // to see that the feed exists and is taken, not wonder
                        // why the list is shorter than the rate card. The same
                        // goes for a placement with no price configured — a
                        // silently shorter list looks like a product decision.
                        <option
                          key={p.value}
                          value={p.value}
                          disabled={full || unconfigured}
                        >
                          {p.label} — {formatUsd(monthlyCentsFor(p.value))}/mo
                          {unconfigured
                            ? " — unavailable"
                            : full
                            ? " — fully booked"
                            : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <ReadOnlyField label="State" value="California" />

                <div>
                  <label htmlFor="city" className={labelClass}>
                    City
                  </label>
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
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {errors.city && (
                    <p className="text-xs text-rose-400 mt-1">{errors.city}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 @xs:grid-cols-2 @lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="start_date" className={labelClass}>
                    Start date
                  </label>
                  <input
                    id="start_date"
                    type="date"
                    min={today}
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      clearError("dates");
                    }}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="duration" className={labelClass}>
                    Duration
                  </label>
                  <select
                    id="duration"
                    value={durationMonths}
                    onChange={(e) =>
                      setDurationMonths(
                        Number(e.target.value) as AdDurationMonths
                      )
                    }
                    className={inputClass}
                  >
                    {AD_DURATIONS_MONTHS.map((months) => (
                      <option key={months} value={months}>
                        {months} {months === 1 ? "month" : "months"}
                      </option>
                    ))}
                  </select>
                </div>

                <ReadOnlyField
                  label="End date"
                  value={endDate}
                  hint="Start date plus the term"
                />
              </div>
              {errors.dates && (
                <p className="text-xs text-rose-400 -mt-2">{errors.dates}</p>
              )}

              <div className="grid grid-cols-1 @xs:grid-cols-2 gap-4">
                <ReadOnlyField
                  label="Rate"
                  value={`${formatUsd(monthlyCentsFor(placement))} / month`}
                  hint={adPlacementLabel(placement)}
                />
                <ReadOnlyField
                  label="Total"
                  value={formatUsd(totalCents)}
                  hint={`${formatUsd(monthlyCentsFor(placement))} × ${durationMonths} ${
                    durationMonths === 1 ? "month" : "months"
                  }, charged once`}
                  large
                />
              </div>

              <div>
                <label htmlFor="ad_image" className={labelClass}>
                  Ad image
                </label>
                <p className="text-xs text-gray-400 mb-1.5">{AD_SPEC_TEXT}</p>
                {/* Not inputClass. The native button is styled through file:*
                    so it matches the rest of the form in every browser, and
                    min-w-0 + w-full keep a long filename inside the card
                    instead of widening it.

                    text-sm here despite the 16px rule elsewhere: that rule
                    exists because iOS Safari zooms when a field takes keyboard
                    focus, and a file input opens the photo picker instead.
                    Nothing to zoom into, and the smaller text is what fits a
                    filename at 295px. */}
                <input
                  id="ad_image"
                  key={fileInputKey}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  className="block w-full min-w-0 p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-gray-300 focus:border-accent focus:outline-none transition file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700"
                />
                {errors.image && (
                  <p className="text-xs text-rose-400 mt-1">{errors.image}</p>
                )}
                {fileInfo && (
                  <p className="text-xs text-green-400 mt-1">✓ {fileInfo}</p>
                )}
              </div>

              {capacityError && (
                <p className="text-sm text-gray-300 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  {capacityError} You can still submit — availability is checked
                  again before you are charged.
                </p>
              )}

              {errors.submit && (
                <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900 rounded-lg p-3">
                  {errors.submit}
                </p>
              )}

              {/* The pay button is replaced outright when the campaign cannot
                  be bought — whether because the placement is full or because
                  it has no price configured — rather than being disabled beside
                  an explanation. A greyed-out "Pay $299" invites a brand to
                  keep clicking it. */}
              {placementUnconfigured ? (
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
                  <p className="font-semibold text-white mb-1">
                    {adPlacementLabel(placement)} is unavailable right now
                  </p>
                  <p className="text-sm text-gray-400">
                    This placement cannot be purchased at the moment. Nothing
                    has been charged and nothing has been saved — try another
                    placement, or check back shortly.
                  </p>
                </div>
              ) : placementFull ? (
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
                  <p className="font-semibold text-white mb-1">
                    This placement is fully booked
                  </p>
                  {/* Deliberately says nothing about how many campaigns a
                      placement holds. At a cap of one "its full 1 campaigns"
                      is broken English, and any count at all implies the spot
                      is shared. It is also cap-agnostic, so raising the cap
                      later does not leave this sentence lying. */}
                  <p className="text-sm text-gray-400">
                    {adPlacementLabel(placement)} is already booked between{" "}
                    {startDate} and {endDate}. Pick another placement, a later
                    start date, or a shorter term.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  // Not disabled while availability is being re-read. The
                  // server checks capacity again before it charges anything, so
                  // blocking the button on an in-flight advisory count would
                  // only make the form feel slow.
                  disabled={busy || !userId}
                  className="bg-accent text-on-accent px-5 py-2.5 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  <ButtonSpinner active={busy} />
                  {uploading
                    ? "Uploading image..."
                    : redirecting
                    ? "Redirecting to Stripe..."
                    : `Continue to payment — ${formatUsd(totalCents)}`}
                </button>
              )}

              <p className="text-xs text-gray-500">
                You are charged once, up front, for the whole term. Review
                happens after payment; a rejected campaign is refunded by hand.
              </p>
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
              {ads.map((ad) => {
                // An unpaid row is a campaign whose checkout was abandoned. It
                // is not pending review and it is not running — no admin will
                // ever see it — so it must not wear the 'Pending' badge that
                // its status column would otherwise give it.
                const unpaid = ad.payment_status === "unpaid";

                return (
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
                          unpaid
                            ? "bg-amber-950/40 border-amber-900 text-amber-400"
                            : STATUS_STYLES[ad.status] ??
                              "bg-zinc-800 border-zinc-700 text-gray-400"
                        }`}
                      >
                        {unpaid ? "Unpaid" : ad.status}
                      </span>
                    </div>

                    <p className="text-xs text-gray-400">
                      {adPlacementLabel(ad.placement)}
                      {ad.city ? ` · ${ad.city}` : ""}
                      {ad.duration_months
                        ? ` · ${ad.duration_months} ${
                            ad.duration_months === 1 ? "month" : "months"
                          }`
                        : ""}
                    </p>
                    {ad.start_date && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {ad.start_date} → {ad.end_date}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ad.amount_charged != null
                        ? `$${Number(ad.amount_charged).toLocaleString()} paid`
                        : "—"}
                      {!unpaid && ad.status === "pending" && " · not running yet"}
                      {ad.status === "approved" &&
                        (ad.is_active ? " · live" : " · approved, paused")}
                    </p>

                    {unpaid && (
                      <div className="mt-2.5 rounded-lg border border-amber-900 bg-amber-950/30 p-2.5">
                        <p className="text-xs font-semibold text-amber-400 mb-1">
                          Payment incomplete
                        </p>
                        <p className="text-xs text-gray-300 mb-2">
                          Nothing was charged, and this campaign is not in the
                          review queue. It holds no placement until it is paid
                          for.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleResume(ad.id)}
                          disabled={redirecting}
                          className="text-xs font-semibold bg-accent text-on-accent px-3 py-1.5 rounded-md hover:bg-accent-hover transition disabled:opacity-50"
                        >
                          Complete payment
                        </button>
                      </div>
                    )}

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
                );
              })}

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
