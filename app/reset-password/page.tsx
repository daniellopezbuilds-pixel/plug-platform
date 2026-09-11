"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE, validatePassword } from "@/lib/passwords";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { Spinner } from "@/components/ui/Spinner";

const inputClass =
  "w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-accent focus:outline-none transition";

const labelClass = "block text-sm text-gray-400 mb-1";

type Status = "checking" | "ready" | "invalid";

/**
 * Whether the link in the address bar is one of the old implicit-flow ones.
 *
 * Remove this and the branch that sets it once the hour-long window of
 * pre-migration links has passed — see the effect below.
 */
type LinkVintage = "current" | "pre-migration";

/**
 * Works out what the link in the address bar is worth, in one place.
 *
 * Kept out of the component because it is a decision about the URL and the
 * session, not about rendering — the component's job is to show whichever of
 * the three answers comes back.
 */
async function resolveLink(): Promise<{
  status: Exclude<Status, "checking">;
  vintage: LinkVintage;
}> {
  // A dead link arrives here with ?error= from the callback, rather than being
  // dropped on a page that waits for a session it already knows is not coming.
  if (new URLSearchParams(window.location.search).get("error")) {
    return { status: "invalid", vintage: "current" };
  }

  /**
   * Links sent before cookie-backed sessions shipped.
   *
   * Those were issued under the implicit flow and arrive as
   * #access_token=...&type=recovery. The client is PKCE now, and auth-js rejects
   * the mismatch outright instead of parsing the fragment
   * (AuthPKCEGrantCodeExchangeError, "Not a valid PKCE flow url"), so no session
   * appears and the generic expired screen would be what the user gets.
   *
   * That screen would be true but misleading: the link is not expired, it was
   * issued by a version of the app that no longer exists, and the user may have
   * requested it sixty seconds ago. Recovery tokens live one hour
   * (auth.otp_expiry), so this branch is reachable for one hour after deploy and
   * never again. Delete it then, along with LinkVintage.
   */
  const hash = window.location.hash;
  if (hash.includes("access_token") || hash.includes("type=recovery")) {
    return { status: "invalid", vintage: "pre-migration" };
  }

  // Past the callback there either is a session cookie or there is not. No
  // fragment to wait for, so one question settles it.
  const { data, error } = await supabase.auth.getUser();

  return {
    status: error || !data.user ? "invalid" : "ready",
    vintage: "current",
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>("checking");
  const [vintage, setVintage] = useState<LinkVintage>("current");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Deciding whether there is a recovery session to work with.
   *
   * This used to be the hard part of the page. The token arrived as a URL
   * fragment, the client parsed it asynchronously AFTER this component mounted,
   * and the page had to resolve three ways — an auth event, a session that had
   * already been parsed before the effect ran, or a 2.5s timeout deciding the
   * link was dead — because subscribing alone hung on "checking" and deciding
   * early showed "expired" on a link that was about to work.
   *
   * All of that is gone. app/auth/callback/route.tsx verifies the token and
   * writes the session cookie before this page is requested at all, so by the
   * time this effect runs the answer already exists and one getUser() settles
   * it. The race had no winner worth keeping.
   */
  useEffect(() => {
    let active = true;

    resolveLink().then((resolved) => {
      if (!active) return;

      setVintage(resolved.vintage);
      setStatus(resolved.status);
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit() {
    setError(null);

    const invalid = validatePassword(password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setSubmitting(false);

    if (updateError) {
      // A recovery token that was already spent fails here rather than in the
      // callback, so this path needs the same dead-link treatment as a bad link
      // — otherwise the user is left staring at a raw "Auth session missing!"
      // with nowhere to go.
      if (/session|token|expired|jwt/i.test(updateError.message)) {
        setStatus("invalid");
        setError(null);
        return;
      }

      // Everything else — most usefully "New password should be different
      // from the old password" — is actionable, so it is shown as-is.
      setError(updateError.message);
      return;
    }

    // updateUser leaves the recovery session in place as a normal one, so the
    // user is already signed in at this point.
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">
            Sparx Plug <span className="text-accent-2-soft">Ecosystem</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Connect. Build. Grow.</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          {status === "checking" && (
            <>
              <h2 className="text-lg font-semibold mb-1">Checking your link</h2>
              <div className="flex items-center gap-3 mt-3">
                <Spinner size="sm" label="" />
                <p className="text-sm text-gray-400">One moment</p>
              </div>
            </>
          )}

          {status === "invalid" && (
            <>
              {vintage === "pre-migration" ? (
                <>
                  <h2 className="text-lg font-semibold mb-1">
                    This link needs replacing
                  </h2>
                  <p className="text-sm text-gray-400 mb-5">
                    It was sent by an earlier version of the site and can&apos;t
                    be used any more, even if you only just received it. Request
                    a new one and it&apos;ll work.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold mb-1">
                    This link has expired
                  </h2>
                  <p className="text-sm text-gray-400 mb-5">
                    Password reset links can only be used once, and they expire
                    after a while. Request a new one and it&apos;ll work.
                  </p>
                </>
              )}

              <Link
                href="/forgot-password"
                className="block w-full text-center bg-accent text-on-accent p-3 rounded-lg font-semibold hover:bg-accent-hover transition"
              >
                Request a new link
              </Link>
            </>
          )}

          {status === "ready" && (
            <>
              <h2 className="text-lg font-semibold mb-1">Set a new password</h2>
              <p className="text-sm text-gray-400 mb-5">{PASSWORD_RULE}</p>

              <div className="space-y-3">
                <div>
                  <label htmlFor="password" className={labelClass}>
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="confirm" className={labelClass}>
                    Confirm new password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmit();
                    }}
                    className={inputClass}
                  />
                </div>

                {error && (
                  <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900 rounded-lg p-3">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full bg-accent text-on-accent p-3 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  <ButtonSpinner active={submitting} />
                  {submitting ? "Saving..." : "Save new password"}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-sm text-gray-400 mt-5">
          <Link href="/login" className="text-accent-2-soft hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
