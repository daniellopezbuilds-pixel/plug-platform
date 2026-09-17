"use client";

import { useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useNotifications } from "@/hooks/useNotifications";

/**
 * Panel geometry. The panel is rendered into <body> and positioned against the
 * bell in viewport coordinates, so every number here is a viewport measurement.
 * The first three reproduce what the Tailwind classes used to say: w-80,
 * max-h-96, mt-2.
 */
const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 384;
const BELL_GAP = 8;
/** Gap kept from every viewport edge. */
const VIEWPORT_MARGIN = 16;
/** Floor for the height cap, so a very short window still gets a usable list. */
const PANEL_MIN_HEIGHT = 160;

type PanelBox = { left: number; top: number; width: number; maxHeight: number };

/**
 * Where the panel goes, given where the bell is.
 *
 * Horizontal: left-aligned to the bell, then pulled back inside the viewport.
 * That clamp is what replaces the old `max-md:right-0`. On mobile the bell sits
 * at the right edge, so left-aligning a 320px panel overflows and the clamp
 * slides it back until it is flush right — one rule instead of a breakpoint.
 * It also covers the 768-1023px band, where MobileTopBar (`lg:hidden`) is the
 * thing on screen but the panel was still using the `md`-and-up desktop
 * alignment and hanging off the right edge.
 *
 * Vertical: below the bell, capped at whatever room is actually left under it.
 * At 1024x768 there are ~676px, so the 384px cap binds first and nothing about
 * the current look changes; in a short window the viewport cap takes over and
 * the list scrolls inside the panel instead of running off the bottom.
 */
function panelBoxFor(bell: DOMRect): PanelBox {
  const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const top = bell.bottom + BELL_GAP;

  return {
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(bell.left, window.innerWidth - width - VIEWPORT_MARGIN),
    ),
    top,
    width,
    maxHeight: Math.max(
      PANEL_MIN_HEIGHT,
      Math.min(PANEL_MAX_HEIGHT, window.innerHeight - top - VIEWPORT_MARGIN),
    ),
  };
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // TWO of these are mounted at all times — MobileTopBar's and Sidebar's — with
  // only one visible per breakpoint, each hidden by an ancestor rather than by
  // not rendering. So a literal id would be a duplicate id in the document, and
  // both bells' aria-controls would point at the same string, including the
  // hidden bell pointing at the visible one's panel.
  const panelId = useId();

  // One piece of state for both "is it open" and "where is it". Deriving open
  // from the box being non-null is what guarantees the panel never renders
  // without a measured position, so there is no frame at (0,0) before an
  // effect corrects it.
  const [box, setBox] = useState<PanelBox | null>(null);
  const open = box !== null;

  function toggle() {
    if (open) {
      setBox(null);
      return;
    }
    // Measured here rather than in a layout effect: the first paint is already
    // in the right place, and useLayoutEffect would warn during SSR — this is a
    // client component but it is still prerendered on the server.
    const bell = bellRef.current;
    if (bell) setBox(panelBoxFor(bell.getBoundingClientRect()));
  }

  useEffect(() => {
    if (!open) return;
    const bell = bellRef.current;
    if (!bell) return;

    function sync() {
      // Re-read the ref rather than closing over the checked `bell` above:
      // these fire from listeners, so the element can be gone by now.
      const current = bellRef.current;
      if (!current) return;

      const rect = current.getBoundingClientRect();

      // A bell hidden by an ancestor measures 0x0, and that happens for real:
      // crossing the lg breakpoint with the panel open swaps which of the two
      // instances is visible. The old panel was absolutely positioned inside
      // the bell's own wrapper, so it disappeared along with it; a panel
      // portaled to <body> does not, and would be left floating mid-page with
      // nothing anchoring it. Close it instead of repositioning it.
      if (rect.width === 0 && rect.height === 0) {
        setBox(null);
        return;
      }

      setBox(panelBoxFor(rect));
    }

    // Both observers are needed, for different changes. The bell is always
    // 44x44, so a width change that slides it sideways — the mobile bell is
    // pinned to the right edge — resizes nothing and only `resize` catches it.
    // Going display:none is the reverse: no window resize need be involved
    // (the sidebar could hide it some other way) and only the observer sees it.
    const observer = new ResizeObserver(sync);
    observer.observe(bell);

    // The panel is no longer a descendant of the bell, so "outside" is two
    // elements now instead of one wrapper. Without the panel check, every click
    // inside the panel — Mark all read especially — would close it first. The
    // bell check has to stay too, or mousedown would close and the button's own
    // onClick would immediately reopen, and the bell would never dismiss.
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (bellRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setBox(null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setBox(null);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", sync);
    // Capture phase: neither container the bell sits in scrolls today (both the
    // sidebar header and the mobile top bar are pinned), but a bubbling scroll
    // listener would not see it if one ever did.
    window.addEventListener("scroll", sync, true);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      observer.disconnect();
    };
  }, [open]);

  return (
    <>
      <button
        ref={bellRef}
        type="button"
        onClick={toggle}
        aria-label={
          unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"
        }
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        className="relative w-11 h-11 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 bg-accent-2 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* PORTALED TO <body>, AND IT HAS TO BE.
          The bell renders inside the sidebar, and the sidebar is
          `overflow-hidden` — a fixed-height column with a pinned header, a
          scrolling nav and a pinned footer. A 320px panel anchored to a bell
          188px into a 256px aside was cut off at the aside's right edge with
          69px of 320 showing.

          `position: fixed` does NOT get out of this, which is the part worth
          knowing: the aside carries `lg:translate-x-0` for the mobile drawer,
          and a non-`none` translate makes it the containing block for fixed
          descendants — so the panel stays inside the element doing the
          clipping and is clipped just the same. Verified in the browser:
          offsetParent was still ASIDE and a hit-test past x=256 fell through to
          the page content. Leaving the DOM subtree is the only fix, which is
          why the position is measured and applied inline rather than expressed
          in classes.

          z-[60], not z-50: this is a body-level sibling of the mobile drawer,
          which is also z-50, and it should sit above it on its own rather than
          by winning a DOM-order tie-break. */}
      {open &&
        createPortal(
          <div
            id={panelId}
            ref={panelRef}
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              maxHeight: box.maxHeight,
            }}
            className="fixed bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-[60] overflow-y-auto scrollbar-dark text-white"
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <p className="font-semibold">Notifications</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-xs text-accent-2-soft hover:text-white"
                >
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">No notifications yet.</p>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id} className="border-b border-zinc-800 last:border-b-0">
                    <Link
                      href={n.link || "#"}
                      onClick={() => {
                        markAsRead(n.id);
                        setBox(null);
                      }}
                      className={`block p-4 hover:bg-zinc-800 transition ${
                        !n.read ? "bg-zinc-800/50" : ""
                      }`}
                    >
                      <p className="text-sm font-semibold">{n.title}</p>
                      {n.message && (
                        <p className="text-sm text-gray-400 mt-1">{n.message}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
