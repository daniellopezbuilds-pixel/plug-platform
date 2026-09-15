"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AdDurationMonths, AdPlacement } from "@/lib/adPricing";

export type PlacementCapacity = {
  taken: number;
  cap: number;
  full: boolean;
  /**
   * False when this placement has no Stripe Price configured — an operator
   * problem, not a caller one. The form treats it like a fully-booked
   * placement: the pay button is replaced rather than disabled, so nobody
   * fills in a campaign that cannot be bought.
   */
  configured: boolean;
};

export type CapacityByPlacement = Record<string, PlacementCapacity>;

/**
 * Starting (or resuming) payment for a brand campaign, and reading how full
 * each placement is.
 *
 * Both call authenticated API routes with a bearer token rather than touching
 * Supabase directly — see the header of lib/apiAuth.tsx. The campaign row is
 * created server-side by /api/stripe/checkout/ad, so unlike every other write
 * in this app nothing here inserts anything: the browser hands over what the
 * brand typed and the server decides what that costs.
 */
export function useAdCheckout() {
  const [redirecting, setRedirecting] = useState(false);

  const authHeader = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // getSession() is the local copy; the route validates it before creating
    // anything, so a stale token fails there rather than here.
    return session ? { Authorization: "Bearer " + session.access_token } : null;
  }, []);

  /**
   * How many campaigns already hold each placement over the proposed window.
   *
   * Advisory. The checkout route re-counts before it writes, so a stale number
   * here costs a clear error message at the end of the form rather than an
   * oversold placement.
   */
  const fetchCapacity = useCallback(
    async (
      startDate: string,
      durationMonths: AdDurationMonths
    ): Promise<{ capacity: CapacityByPlacement | null; error: string | null }> => {
      const headers = await authHeader();

      if (!headers) return { capacity: null, error: "You must be logged in." };

      const params = new URLSearchParams({
        startDate,
        durationMonths: String(durationMonths),
      });

      try {
        const res = await fetch("/api/ads/capacity?" + params.toString(), {
          headers,
        });
        const data = await res.json();

        if (!res.ok) {
          return { capacity: null, error: data.error || "Could not check availability." };
        }

        return { capacity: data.placements as CapacityByPlacement, error: null };
      } catch {
        return { capacity: null, error: "Could not check availability." };
      }
    },
    [authHeader]
  );

  /**
   * Hand the campaign to the server and follow it to Stripe.
   *
   * On success this never returns — the browser navigates away. `redirecting`
   * stays true for that reason: releasing it would flash an enabled button
   * under the user's cursor during the navigation.
   */
  const startCheckout = useCallback(
    async (input: {
      title: string;
      linkUrl: string;
      imagePath: string;
      placement: AdPlacement;
      city: string;
      startDate: string;
      durationMonths: AdDurationMonths;
    }): Promise<{ error: string | null }> => {
      setRedirecting(true);

      const headers = await authHeader();

      if (!headers) {
        setRedirecting(false);
        return { error: "You must be logged in." };
      }

      try {
        const res = await fetch("/api/stripe/checkout/ad", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        const data = await res.json();

        if (!res.ok || !data.url) {
          setRedirecting(false);
          return { error: data.error || "Could not start checkout." };
        }

        window.location.href = data.url;
        return { error: null };
      } catch {
        setRedirecting(false);
        return { error: "Could not start checkout." };
      }
    },
    [authHeader]
  );

  /**
   * Re-open checkout for a campaign that was created but never paid for.
   *
   * Only the id crosses the wire: the server re-reads placement, duration and
   * dates off the row, so resuming cannot change what is being bought.
   */
  const resumeCheckout = useCallback(
    async (listingId: string): Promise<{ error: string | null }> => {
      setRedirecting(true);

      const headers = await authHeader();

      if (!headers) {
        setRedirecting(false);
        return { error: "You must be logged in." };
      }

      try {
        const res = await fetch("/api/stripe/checkout/ad", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });

        const data = await res.json();

        if (!res.ok || !data.url) {
          setRedirecting(false);
          return { error: data.error || "Could not start checkout." };
        }

        window.location.href = data.url;
        return { error: null };
      } catch {
        setRedirecting(false);
        return { error: "Could not start checkout." };
      }
    },
    [authHeader]
  );

  return { fetchCapacity, startCheckout, resumeCheckout, redirecting };
}
