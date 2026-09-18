"use client";

import { useId, useState } from "react";

/**
 * A password field with a show/hide toggle.
 *
 * Replaces the bare <input type="password"> on login, signup, reset password
 * and change password. Those four had five different sets of props between
 * them — autoComplete, minLength, placeholder, id — so this takes the input
 * props it needs and passes the rest through unchanged rather than trying to
 * normalise them.
 *
 * THE TOGGLE IS A BUTTON, NOT AN ICON. type="button" explicitly: every one of
 * these sits inside a <form>, and a button with no type defaults to submit —
 * showing your password would submit the form. tabIndex={-1} keeps it out of
 * the tab order so Tab still goes password -> confirm -> submit, which is the
 * sequence someone typing a password expects; it stays reachable by pointer and
 * by screen reader, which is what it is for.
 *
 * Eye and eye-off are drawn in the same Heroicons outline idiom as everything
 * else here — 24x24, fill none, stroke currentColor, width 2, round caps. No
 * dependency.
 */
export function PasswordInput({
  value,
  onChange,
  className,
  id,
  ...inputProps
}: {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange">) {
  const [visible, setVisible] = useState(false);

  // Only used when the caller has not supplied an id — the label association on
  // the existing forms must keep working.
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      <input
        {...inputProps}
        id={inputId}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        // pr-12 reserves the toggle's column so a long password scrolls under
        // the button instead of behind it.
        className={`${className ?? ""} pr-12`}
      />

      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={inputId}
        // Centred on the input's own box rather than given a fixed top, so it
        // stays aligned whatever vertical padding the caller's class sets.
        className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white transition"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          {visible ? (
            // Eye with a slash — "hide". Shown while the password is visible,
            // because the icon names what the button will do.
            <>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </>
          ) : (
            <>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
