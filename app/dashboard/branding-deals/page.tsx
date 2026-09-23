"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAds, type Ad } from "@/hooks/useAds";
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
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { RailCard } from "@/components/layout/RailCard";
import { AdStatusPill, adStateOf } from "@/components/ads/AdStatusPill";
import { AdSubmissionSkeleton } from "@/components/ui/Skeleton";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { FIELD_CONTROL, FIELD_LABEL, Field, FieldRow, FormSection } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { LoadMore } from "@/components/ui/LoadMore";
import { useToast } from "@/components/ui/Toast";
// The same list signup writes to profiles.location. Targeting a city only
// matches profiles if both ends spell it the same way, so there is one list
// and not two that happen to agree. See lib/locations.tsx.
import { AD_TARGET_CITIES } from "@/lib/locations";

/**
 * Branding deals — a brand's campaigns, and buying a new one.
 *
 * CAMPAIGNS FIRST. The page used to open on the new-ad form with the
 * submissions squeezed into a side column; a brand comes back to check on
 * its campaigns far more often than to create one. The list now leads, full
 * width, and the form opens from a button (or on its own for a brand with no
 * campaigns yet). Borrowed from Meta and LinkedIn Campaign Manager, where the
 * campaign list is the home screen. NOT borrowed: their metrics columns —
 * analytics is cut from this phase (spec section 3).
 *
 * THE RAIL shows what the form will produce: a live preview of the creative
 * as the feed card renders it, and the order summary. With the form closed
 * it shows the rate card and how review works. Under 1280 both sit inside
 * the form, beside the fields they reflect.
 */

/**
 * A value the form computes or fixes, shown in a field position but not
 * editable — State (always California), End date (start plus the term).
 * Deliberately has NO box: a bordered, dark-filled value reads as an input
 * that will not accept typing.
 */
function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className={FIELD_LABEL}>{label}</p>
      <p className="flex min-h-12 items-center font-semibold text-white">{value}</p>
      {hint && <p className="-mt-1 text-xs text-gray-500">{hint}</p>}
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

  const { withRail } = useRailBreakpoints();

  /**
   * Whether the new-advertisement form is open. Closed by default once the
   * brand has campaigns — they come back to check on those far more often
   * than to create one — and open for a brand with none, for whom the form
   * is the only thing to do. Null means "not decided yet": the list has not
   * loaded, so the default cannot be chosen.
   */
  const [formOpen, setFormOpen] = useState<boolean | null>(null);
  const showForm = formOpen ?? (!loading && ads.length === 0);

  const today = todayIso();

  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [placement, setPlacement] = useState<AdPlacement>("feed");
  const [city, setCity] = useState<string>(AD_TARGET_CITIES[0]);
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

  // The creative as an object URL for the preview; revoked when it changes.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // An external resource created in the effect, handed to state for the
    // <img> — the synchronisation effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [file]);

  const preview = (
    <CreativePreview imageUrl={previewUrl} title={title} placement={placement} />
  );

  const orderSummary = (
    <RailCard title="Order summary">
      <dl className="space-y-2 px-4 py-3 text-sm">
        <SummaryRow label="Placement" value={adPlacementLabel(placement)} />
        <SummaryRow label="City" value={city} />
        <SummaryRow label="Runs" value={`${startDate} → ${endDate}`} />
        <SummaryRow
          label="Rate"
          value={`${formatUsd(monthlyCentsFor(placement))} × ${durationMonths} ${
            durationMonths === 1 ? "month" : "months"
          }`}
        />
        <div className="flex items-baseline justify-between border-t border-zinc-800 pt-2">
          <dt className="text-gray-400">Total, charged once</dt>
          <dd className="text-xl font-bold text-white">{formatUsd(totalCents)}</dd>
        </div>
      </dl>
    </RailCard>
  );

  const rateCard = (
    <RailCard title="Placements">
      <ul className="divide-y divide-zinc-800">
        {AD_PLACEMENTS.map((p) => (
          <li key={p.value} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-gray-300">{p.label}</span>
            <span className="font-semibold text-white">
              {formatUsd(monthlyCentsFor(p.value))}/mo
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-zinc-800 px-4 py-3 text-xs text-gray-400">
        Flat monthly rates, paid up front. Every campaign is reviewed after
        payment and stays off the site until an admin approves it.
      </p>
    </RailCard>
  );

  return (
    <RailColumns
      withRail={withRail}
      split={false}
      rightLabel={showForm ? "Preview and order summary" : "Placements"}
      right={
        showForm ? (
          <>
            {preview}
            {orderSummary}
          </>
        ) : (
          rateCard
        )
      }
    >
      <PageHeading
        title="Branding deals"
        size="compact"
        actions={
          !showForm && ads.length > 0 ? (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
            >
              <Icon name="plus" className="h-4 w-4" />
              <span className="hidden sm:inline">New advertisement</span>
              <span className="sm:hidden">New</span>
            </button>
          ) : undefined
        }
      />

      {/* Theme colours: this was raw green. A confirmation is the accent, as
          in a success toast. */}
      {checkoutOutcome === "success" && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-gray-200">
          <Icon name="checkCircle" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>
            Payment received. Your campaign moves to{" "}
            <span className="text-white">In review</span> as soon as Stripe
            confirms it — usually a few seconds — and an admin reviews it
            before it runs.
          </span>
        </p>
      )}

      {checkoutOutcome === "cancelled" && (
        <p className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-gray-300">
          Checkout was cancelled and nothing was charged. Your campaign is
          saved below as <span className="text-white">Unpaid</span> — you can
          finish paying for it there.
        </p>
      )}

      {showForm && (
        <div className="mb-8 space-y-4">
          <FormSection
            step={1}
            title="Creative"
            description="One 4:1 image, a title, and where a tap goes."
          >
            <FieldRow>
              <Field
                label="Ad title"
                htmlFor="title"
                error={errors.title}
                hint="Shown under the image and read out by screen readers."
              >
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearError("title");
                  }}
                  className={FIELD_CONTROL}
                />
              </Field>
              <Field label="Link" htmlFor="link_url" optional>
                <input
                  id="link_url"
                  type="text"
                  inputMode="url"
                  placeholder="yourbrand.com/offer"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  className={FIELD_CONTROL}
                />
              </Field>
            </FieldRow>

            <Field
              label="Ad image"
              htmlFor="ad_image"
              hint={AD_SPEC_TEXT}
              error={errors.image}
            >
              {/* text-sm on the file input despite the 16px rule: that rule
                  exists because iOS zooms when a field takes keyboard focus,
                  and a file input opens the photo picker instead. */}
              <input
                id="ad_image"
                key={fileInputKey}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="block min-h-12 w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-sm text-gray-300 transition focus:border-accent focus:outline-none file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700"
              />
            </Field>
            {fileInfo && (
              <p className="-mt-2 flex items-center gap-1.5 text-sm text-gray-300">
                <Icon name="checkCircle" className="h-4 w-4 text-accent" />
                {fileInfo}
              </p>
            )}

            {/* No rail under 1280, so the preview sits with the creative it
                previews. */}
            {!withRail && preview}
          </FormSection>

          <FormSection
            step={2}
            title="Placement and schedule"
            description="Where it runs, for which city, and for how long."
          >
            <FieldRow cols={3}>
              <Field label="Placement" htmlFor="placement">
                <select
                  id="placement"
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as AdPlacement)}
                  className={FIELD_CONTROL}
                >
                  {AD_PLACEMENTS.map((p) => {
                    const state = capacity?.[p.value] ?? null;
                    const full = state?.full ?? false;
                    const unconfigured = state ? !state.configured : false;
                    return (
                      // Disabled rather than hidden: a brand should see that
                      // the feed exists and is taken, not wonder why the list
                      // is shorter than the rate card.
                      <option key={p.value} value={p.value} disabled={full || unconfigured}>
                        {p.label} — {formatUsd(monthlyCentsFor(p.value))}/mo
                        {unconfigured ? " — unavailable" : full ? " — fully booked" : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>

              <ReadOnlyField label="State" value="California" />

              <Field label="City" htmlFor="city" error={errors.city}>
                <select
                  id="city"
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    clearError("city");
                  }}
                  className={FIELD_CONTROL}
                >
                  {AD_TARGET_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </FieldRow>

            <FieldRow cols={3}>
              <Field label="Start date" htmlFor="start_date" error={errors.dates}>
                <input
                  id="start_date"
                  type="date"
                  min={today}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    clearError("dates");
                  }}
                  className={`${FIELD_CONTROL} appearance-none text-left`}
                />
              </Field>

              <Field label="Duration" htmlFor="duration">
                <select
                  id="duration"
                  value={durationMonths}
                  onChange={(e) =>
                    setDurationMonths(Number(e.target.value) as AdDurationMonths)
                  }
                  className={FIELD_CONTROL}
                >
                  {AD_DURATIONS_MONTHS.map((months) => (
                    <option key={months} value={months}>
                      {months} {months === 1 ? "month" : "months"}
                    </option>
                  ))}
                </select>
              </Field>

              <ReadOnlyField label="End date" value={endDate} hint="Start date plus the term" />
            </FieldRow>
          </FormSection>

          <FormSection
            step={3}
            title="Payment"
            description="Charged once, up front, for the whole term. Review happens after payment; a rejected campaign is refunded by hand."
          >
            {!withRail && orderSummary}

            {capacityError && (
              <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-gray-300">
                {capacityError} You can still submit — availability is checked
                again before you are charged.
              </p>
            )}

            {errors.submit && (
              <p
                role="alert"
                className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300"
              >
                {errors.submit}
              </p>
            )}

            {/* The pay button is replaced outright when the campaign cannot be
                bought — full, or no price configured — rather than disabled
                beside an explanation. A greyed-out "Pay $299" invites a brand
                to keep clicking it. */}
            {placementUnconfigured ? (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
                <p className="mb-1 font-semibold text-white">
                  {adPlacementLabel(placement)} is unavailable right now
                </p>
                <p className="text-sm text-gray-400">
                  This placement cannot be purchased at the moment. Nothing has
                  been charged and nothing has been saved — try another
                  placement, or check back shortly.
                </p>
              </div>
            ) : placementFull ? (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
                <p className="mb-1 font-semibold text-white">This placement is fully booked</p>
                {/* Says nothing about how many campaigns a placement holds —
                    any count implies the spot is shared, and it stays true if
                    the cap is raised. */}
                <p className="text-sm text-gray-400">
                  {adPlacementLabel(placement)} is already booked between{" "}
                  {startDate} and {endDate}. Pick another placement, a later
                  start date, or a shorter term.
                </p>
              </div>
            ) : (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                {ads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    disabled={busy}
                    className="min-h-12 rounded-lg px-4 text-sm font-semibold text-gray-400 transition hover:text-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSubmit}
                  // Not disabled while availability is re-read: the server
                  // checks capacity again before it charges anything.
                  disabled={busy || !userId}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
                >
                  <ButtonSpinner active={busy} />
                  {uploading
                    ? "Uploading image..."
                    : redirecting
                    ? "Redirecting to Stripe..."
                    : `Continue to payment — ${formatUsd(totalCents)}`}
                </button>
              </div>
            )}
          </FormSection>
        </div>
      )}

      <section aria-labelledby="campaigns-heading">
        <h2 id="campaigns-heading" className="mb-3 text-lg font-semibold text-white">
          Your campaigns
        </h2>

        {loading ? (
          <AdSubmissionSkeleton />
        ) : ads.length === 0 ? (
          <EmptyState icon="megaphone" title="No campaigns yet">
            Fill in the form above to buy a placement. Your campaign shows up
            here with its payment and review status.
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-3">
              {ads.map((ad) => (
                <li key={ad.id}>
                  <CampaignRow ad={ad} onResume={handleResume} resuming={redirecting} />
                </li>
              ))}
            </ul>
            {/* Pages against the page scroll now; the list used to scroll
                inside its own capped side panel with its own observer. */}
            <LoadMore
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              showEndMessage={ads.length > SUBMISSIONS_PAGE_SIZE}
            />
          </>
        )}
      </section>
    </RailColumns>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gray-400">{label}</dt>
      <dd className="min-w-0 truncate text-right text-white">{value}</dd>
    </div>
  );
}

/**
 * The creative as it will appear — the same 4:1 box and caption as
 * FeedAdCard — so the brand sees the crop and the caption before paying.
 */
function CreativePreview({
  imageUrl,
  title,
  placement,
}: {
  imageUrl: string | null;
  title: string;
  placement: AdPlacement;
}) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Preview · {adPlacementLabel(placement)}
      </p>
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="relative w-full bg-black" style={{ paddingTop: "25%" }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise
            <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-gray-500">
              <Icon name="photo" />
              Your 4:1 image
            </span>
          )}
        </div>
        <p className="truncate px-4 py-3 font-semibold text-white">
          {title.trim() || "Your ad title"}
        </p>
      </div>
      <p className="mt-1.5 text-xs uppercase tracking-wide text-gray-400">Sponsored</p>
    </section>
  );
}

/** One submitted campaign, with whatever it needs from the brand. */
function CampaignRow({
  ad,
  onResume,
  resuming,
}: {
  ad: Ad;
  onResume: (id: string) => void;
  resuming: boolean;
}) {
  const state = adStateOf(ad);
  const meta = [
    adPlacementLabel(ad.placement),
    ad.city,
    ad.duration_months
      ? `${ad.duration_months} ${ad.duration_months === 1 ? "month" : "months"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL, as everywhere else ads render */}
        <img
          src={getAdPublicUrl(ad.image_path)}
          alt=""
          className="aspect-[4/1] w-full shrink-0 rounded-lg border border-zinc-800 object-cover sm:w-48"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-semibold text-white">{ad.title}</h3>
            <AdStatusPill state={state} fallback={ad.status} />
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{meta}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {ad.start_date ? `${ad.start_date} → ${ad.end_date}` : "Dates set on approval"}
            {ad.amount_charged != null &&
              ` · $${Number(ad.amount_charged).toLocaleString()} paid`}
          </p>
        </div>
      </div>

      {/* An unpaid row is a checkout that was abandoned: not in review, not
          running, and no admin will ever see it. Magenta, not the amber it
          was — amber is not in the palette. */}
      {state === "unpaid" && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-accent-2/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-300">
            <span className="font-semibold text-white">Payment incomplete.</span>{" "}
            Nothing was charged; it holds no placement until it is paid for.
          </p>
          <button
            type="button"
            onClick={() => onResume(ad.id)}
            disabled={resuming}
            className="min-h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
          >
            Complete payment
          </button>
        </div>
      )}

      {state === "rejected" && (
        <div className="mt-3 rounded-lg border border-rose-900/70 p-3">
          <p className="mb-0.5 text-xs font-semibold text-rose-400">Why this was rejected</p>
          <p className="text-sm text-gray-300">
            {ad.review_notes?.trim() ||
              "No reason was recorded. Contact support if you need detail."}
          </p>
        </div>
      )}
    </article>
  );
}
