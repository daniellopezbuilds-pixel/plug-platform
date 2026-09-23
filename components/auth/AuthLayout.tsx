import { BrandLogo } from "@/components/brand/BrandLogo";

/**
 * The shell behind /login and /signup.
 *
 * TWO COLUMNS FROM lg, ONE BELOW IT. On a wide screen the brand statement sits
 * left and the form right; under 1024px the grid collapses and the brand stacks
 * above the form, which is where it already was. lg is the project's existing
 * breakpoint — the dashboard sidebar becomes a drawer at exactly the same
 * width — so the public pages and the app change shape together.
 *
 * Shared rather than copied into both pages because the two are seen back to
 * back: a visitor bounces between "Log in" and "Sign up" in a single sitting,
 * and a wordmark that moves by a few pixels between them is the kind of thing
 * that reads as broken without anyone being able to say why.
 *
 * WHAT THIS DOES NOT TOUCH. It is a wrapper and nothing more. The forms, their
 * state, validation, submit handlers and the Google button all live in the
 * pages and are passed through as children untouched.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-black text-white grid-bg overflow-x-hidden">
      {/* Fixed, so they stay put while a tall signup step scrolls. Palette
          colours only, and pointer-events-none so a wash never sits between a
          thumb and a field. */}
      <div
        className="pointer-events-none fixed -top-40 -left-32 h-96 w-96 rounded-full blur-3xl opacity-20"
        style={{ background: "radial-gradient(circle, #FF5E3A 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none fixed -bottom-40 -right-32 h-96 w-96 rounded-full blur-3xl opacity-20"
        style={{ background: "radial-gradient(circle, #AC419F 0%, transparent 70%)" }}
      />

      {/* min-h-screen with vertical centring: short pages (login) sit centred,
          and a tall one (signup step 2, or a phone in landscape) grows past the
          fold and scrolls normally instead of being clipped by a fixed height.
          items-center is only applied from lg — below it the columns stack and
          centring a tall stack would push the form off the top. */}
      <div className="relative min-h-screen mx-auto w-full max-w-6xl px-5 sm:px-8 py-10 lg:py-16 flex flex-col justify-center lg:grid lg:grid-cols-2 lg:gap-12 xl:gap-20 lg:items-center">
        <BrandPanel />

        {/* max-w-md on mobile keeps the measure the forms already had. From lg
            it widens to max-w-lg — the card looked marooned in a half of a
            1440px screen — and hugs the column's left edge so the gap between
            the two halves stays the gutter rather than growing with the
            viewport. */}
        <div className="w-full max-w-md mx-auto lg:mx-0 lg:max-w-lg">{children}</div>
      </div>
    </main>
  );
}

/**
 * The brand statement. Wordmark and tagline, and deliberately nothing else —
 * this is the entry to an app, not a pitch for it. Marketing lives on
 * sparxplug.com.
 */
function BrandPanel() {
  return (
    <div className="text-center lg:text-left mb-8 lg:mb-0">
      {/* Two arrangements, because this element does two different jobs.
          Under lg it is a header above a form, and the stacked logo would push
          the form a screen down — so it is the horizontal one. At lg it is the
          left half of the page and has to hold that half on its own, which is
          what the stacked logo, as drawn, is for.

          The <h1> wraps the images, so the page heading is the logo's alt
          text plus "Ecosystem": "Sparx Plug Ecosystem". */}
      <h1>
        <span className="lg:hidden">
          <BrandLogo size={44} eager />
        </span>
        <span className="hidden lg:inline-flex">
          <BrandLogo variant="stacked" size={260} eager className="lg:items-start" />
        </span>
      </h1>

      <p className="mt-3 lg:mt-6 font-technical text-[11px] sm:text-xs lg:text-sm tracking-[0.2em] uppercase text-gray-500">
        Connect. Build. Grow.
      </p>
    </div>
  );
}
