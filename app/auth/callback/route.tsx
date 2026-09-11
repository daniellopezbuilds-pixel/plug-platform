import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeAuthNext } from "@/lib/returnTo";

/**
 * Where every emailed auth link lands.
 *
 * @public-route — by definition there is no session to authenticate yet; that
 * is what this route creates. What protects it is that it accepts nothing but a
 * single-use, server-issued token (?token_hash= or ?code=) and verifies it with
 * Supabase before writing anything. A caller holding neither gets a redirect
 * and no session. The ?next= destination is passed through safeAuthNext, so it
 * cannot be used as an open redirect.
 *
 * WHY THIS ROUTE HAS TO EXIST
 *
 * The session moved to cookies, and @supabase/ssr's createBrowserClient
 * hardcodes flowType: 'pkce'. Recovery and confirmation links therefore no
 * longer arrive as a #fragment the client can parse on its own — there is a
 * token in the query string that something has to exchange. Without this route
 * password reset is dead (no session is ever established, so /reset-password
 * can only report an expired link) and signup confirmation half-works: the
 * email is confirmed by Supabase's verify endpoint, but the user lands signed
 * out and has to log in.
 *
 * TWO TOKEN SHAPES, BOTH HANDLED
 *
 * ?token_hash= + ?type=  — what the email templates send. verifyOtp() needs
 *   nothing stored on the device, so the link works in any browser. This is the
 *   path we want: people request a reset on a laptop and open their email on a
 *   phone, constantly.
 *
 * ?code=  — PKCE. exchangeCodeForSession() needs the code verifier that the
 *   browser client stored when it sent the request, which is now a cookie, so
 *   the exchange can happen here on the server. But a cookie lives in one
 *   browser, so a ?code= link only works in the browser that asked for it.
 *   Kept because it is what OAuth will send when it ships, and because a link
 *   from before the templates were switched over still arrives this way.
 *
 * If the templates ever revert to {{ .ConfirmationURL }}, links silently become
 * same-browser-only rather than breaking, which is the failure mode that gets
 * discovered late. The templates are dashboard state and are not in version
 * control — see supabase/README.md.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeAuthNext(params.get("next"));

  /**
   * Cookies are buffered rather than written to a response as they arrive.
   *
   * The destination is not known until the verification has either succeeded or
   * failed, so there is no response object to write onto while Supabase is
   * still working. Collecting the writes and applying them to whichever
   * response we end up returning avoids building the response twice.
   */
  const pendingCookies: {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[] = [];
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          pendingCookies.push(...cookiesToSet);
          Object.assign(pendingHeaders, headers);
        },
      },
    }
  );

  let failed = true;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    failed = Boolean(error);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    failed = Boolean(error);
  }

  // Supabase sends its own failures back as ?error=&error_code=, e.g. an
  // expired or already-used link. Treated the same as a verification failure:
  // the user does not need to know which, they need the screen that offers them
  // a new link.
  if (params.get("error") || params.get("error_code")) {
    failed = true;
  }

  const destination = failed ? failureDestination(type, next) : next;

  const response = NextResponse.redirect(new URL(destination, request.url));

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }

  // Cache-Control: private, no-store and friends, which Supabase supplies
  // alongside any auth cookie write. A cached redirect that carries someone's
  // session cookie hands that session to the next visitor.
  for (const [key, value] of Object.entries(pendingHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

/**
 * Where a dead link goes.
 *
 * A failed recovery belongs on /reset-password, which already owns the "this
 * link has expired / request a new one" screen and now reads ?error to show it
 * without waiting on a session that is never coming. Everything else — an
 * expired signup confirmation, a stale email-change link — belongs on /login,
 * which is where those users are trying to get to anyway.
 */
function failureDestination(type: EmailOtpType | null, next: string): string {
  if (type === "recovery" || next.startsWith("/reset-password")) {
    return "/reset-password?error=link_invalid";
  }

  return "/login?error=link_invalid";
}
