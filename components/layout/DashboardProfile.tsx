"use client";

import { createContext, useContext } from "react";
import type { ActiveProfile } from "@/hooks/useActiveRole";

/**
 * The signed-in user's profile, as the dashboard layout already loaded it.
 *
 * The layout fetches this once to draw the sidebar. Pages that want the same
 * name, photo or trade — the feed's composer and profile card — read it from
 * here rather than calling useActiveRole() again, which would be a second
 * identical profiles query per page view.
 *
 * Null outside the dashboard shell, and callers must handle that; the layout
 * only renders its children once the profile has resolved, so inside the
 * shell it is always present.
 */
const DashboardProfileContext = createContext<ActiveProfile | null>(null);

export const DashboardProfileProvider = DashboardProfileContext.Provider;

export function useDashboardProfile(): ActiveProfile | null {
  return useContext(DashboardProfileContext);
}
