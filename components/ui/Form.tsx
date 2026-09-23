/**
 * Form building blocks for the dashboard: sections, fields, and the two
 * controls a native input does badly — a small set of mutually exclusive
 * choices, and a yes/no.
 *
 * Every form in the app had its own INPUT and LABEL constants, all slightly
 * different, and all stacking every field in one column. These exist so a
 * form can group related fields side by side and still collapse to one column
 * on a phone, without each page re-deciding padding, focus and error styling.
 *
 * MOBILE RULES THAT LIVE HERE, so no page has to remember them:
 *   - text-base (16px) on every control. iOS Safari zooms the page on focus
 *     for anything smaller, and does not zoom back out.
 *   - min-h-12 (48px) on every control, above the 44px tap-target floor.
 *   - [color-scheme:dark] so the native date picker, select popup and
 *     scrollbars inside them are dark rather than a white sheet over a black
 *     page.
 */

/** A text input, select, date or textarea. Add `h-40` or similar for a textarea. */
export const FIELD_CONTROL =
  "block w-full min-w-0 min-h-12 px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-base text-white placeholder:text-gray-500 [color-scheme:dark] transition-colors hover:border-zinc-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent aria-[invalid=true]:border-rose-500 disabled:opacity-50 disabled:cursor-not-allowed";

/** For the few places a label sits outside <Field>, e.g. LocationField's. */
export const FIELD_LABEL = "block text-sm font-medium text-gray-300 mb-2";

export function errorIdFor(id: string) {
  return `${id}-error`;
}

/**
 * One titled group of related fields, as its own card.
 *
 * A CARD PER SECTION rather than one card holding all of them with rules
 * between: a long form reads as a list of short ones, and on a phone the
 * edge of each card is where you can tell you have moved on.
 */
export function FormSection({
  title,
  description,
  step,
  children,
}: {
  title: string;
  description?: string;
  /** Shown as a small numeral before the title, for a form read in order. */
  step?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950">
      <header className="border-b border-zinc-800 px-4 py-4 sm:px-6">
        <h2 className="flex items-center gap-3 text-lg font-semibold text-white">
          {step !== undefined && (
            <span className="font-technical flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-xs text-accent">
              {step}
            </span>
          )}
          {title}
        </h2>
        {description && (
          <p className={`text-sm text-gray-400 mt-1 ${step !== undefined ? "sm:pl-10" : ""}`}>
            {description}
          </p>
        )}
      </header>
      <div className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">{children}</div>
    </section>
  );
}

/**
 * Side-by-side fields that stack on a phone.
 *
 * `cols` is the widest it gets; everything is one column below `sm`. Three
 * goes two-up at `sm` first, because three selects in 600px leaves each too
 * narrow for its longest option.
 */
export function FieldRow({
  cols = 2,
  children,
}: {
  cols?: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${
        cols === 3 ? "lg:grid-cols-3" : ""
      }`}
    >
      {children}
    </div>
  );
}

/**
 * Label, control, hint and error for one field.
 *
 * The control is passed as children so a page keeps full control of it; this
 * only owns the chrome around it. Give the control `id={htmlFor}`, and
 * `aria-invalid` / `aria-describedby={errorIdFor(htmlFor)}` when it can error,
 * so the message is read out with the field.
 */
export function Field({
  label,
  htmlFor,
  optional,
  hint,
  error,
  className = "",
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const LabelTag = htmlFor ? "label" : "p";

  return (
    <div className={`min-w-0 ${className}`}>
      <LabelTag
        {...(htmlFor ? { htmlFor } : {})}
        className="mb-2 flex items-baseline justify-between gap-3 text-sm font-medium text-gray-300"
      >
        <span>{label}</span>
        {optional && (
          <span className="text-xs font-normal text-gray-500">Optional</span>
        )}
      </LabelTag>
      {children}
      {hint && !error && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
      <FieldError id={htmlFor ? errorIdFor(htmlFor) : undefined} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-sm text-rose-400">
      {message}
    </p>
  );
}

/**
 * A short set of mutually exclusive options as tappable tiles.
 *
 * REAL RADIO INPUTS, visually hidden, inside labels. That is what gives arrow
 * keys, a single tab stop and a correct screen-reader announcement for free —
 * a row of buttons toggling state has none of them. The whole tile is the
 * label, so the tap target is the tile.
 *
 * For four or fewer options. More than that is a select.
 */
export function ChoiceGroup<V extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  disabled,
  error,
  optional,
  columns = 2,
  compact = false,
}: {
  name: string;
  legend: string;
  options: readonly { value: V; label: string; description?: string }[];
  value: V | "";
  onChange: (next: V) => void;
  disabled?: boolean;
  error?: string;
  optional?: boolean;
  /** 2 and 3 at every width; 4 is two-up on a phone, which fits "Residential". */
  columns?: 2 | 3 | 4;
  /**
   * Tighter, centred tiles for a narrow container such as a side rail, where
   * the default side padding pushes a label like "Non-union" onto two lines.
   */
  compact?: boolean;
}) {
  // Three is three at every width: a 2+1 split on a phone leaves one option
  // alone on a row and reads as a different kind of choice. Three short labels
  // fit in 100px tiles; longer ones should use columns={2}.
  const cols =
    columns === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : columns === 3
      ? "grid-cols-3"
      : "grid-cols-2";
  const errorId = `${name}-error`;

  return (
    <fieldset
      className="min-w-0"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-2 flex w-full items-baseline justify-between gap-3 text-sm font-medium text-gray-300">
        <span>{legend}</span>
        {optional && (
          <span className="text-xs font-normal text-gray-500">Optional</span>
        )}
      </legend>
      <div className={`grid gap-2 ${cols}`}>
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={`relative flex min-h-12 cursor-pointer flex-col justify-center rounded-lg border py-2.5 text-sm transition-colors ${
                compact ? "px-1.5 text-center" : "px-3"
              } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${
                checked
                  ? "border-accent bg-accent/10 text-white"
                  : error
                  ? "border-rose-500 bg-zinc-900 text-gray-300 hover:border-zinc-600"
                  : "border-zinc-700 bg-zinc-900 text-gray-300 hover:border-zinc-600"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                disabled={disabled}
                className="sr-only"
              />
              <span className="font-semibold">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 text-xs text-gray-400">
                  {option.description}
                </span>
              )}
            </label>
          );
        })}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

/**
 * A yes/no as a bordered row, the whole of which is the tap target.
 *
 * A bare 20px checkbox beside a line of text is a small target on a phone,
 * and the label being clickable is not something anybody discovers.
 */
export function CheckboxTile({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${
        checked
          ? "border-accent bg-accent/10"
          : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-700 bg-zinc-800 accent-[var(--color-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-gray-400">{description}</span>
        )}
      </span>
    </label>
  );
}
