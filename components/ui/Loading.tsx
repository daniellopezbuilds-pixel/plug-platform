import { Spinner } from "./Spinner";

/**
 * Full-page loading: the dashboard layout, AuthGuard, route transitions.
 *
 * Vertically centred in whatever space it is given rather than sitting at the
 * top of the page. `min-h-[60vh]` gives it something to centre inside when the
 * parent has no height of its own, which is the usual case for a page that has
 * not rendered its content yet.
 *
 * The label is a real visible line, so `Spinner` takes an empty accessible
 * label — otherwise a screen reader hears "Loading" twice.
 */
export function PageLoader({ message = "Loading" }: { message?: string }) {
  return (
    <div className="min-h-[60vh] w-full flex flex-col items-center justify-center gap-4">
      <Spinner size="lg" label="" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

/**
 * Full-viewport variant, for the shell states that render before the dashboard
 * layout exists — AuthGuard and the layout's own profile fetch. Those have no
 * content column to centre inside yet.
 */
export function ScreenLoader({ message = "Loading" }: { message?: string }) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
      <Spinner size="lg" label="" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

/**
 * Inline loading, for a section of a page that is still fetching while the
 * rest of the layout is already on screen.
 *
 * Left-aligned and in normal flow, so it occupies the place the content will
 * occupy rather than re-centring the section around itself.
 */
export function InlineLoader({ message = "Loading" }: { message?: string }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <Spinner size="sm" label="" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}
