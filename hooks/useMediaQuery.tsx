"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query currently matches, kept live.
 *
 * FOR DECIDING WHAT TO MOUNT, not how to style. CSS breakpoints are the right
 * tool for layout, but they cannot stop a hidden component's queries from
 * running — a rail card hidden with `hidden xl:block` still fetches on a
 * phone. Where a component should not exist at all below a width, this is the
 * switch.
 *
 * FALSE ON THE SERVER AND DURING HYDRATION, via getServerSnapshot, so the
 * first client render matches the prerendered HTML and the real value arrives
 * one commit later. Callers must therefore treat `false` as "not known to
 * match yet" and render the narrow layout for it.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
