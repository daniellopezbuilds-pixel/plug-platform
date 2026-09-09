import { Spinner } from "./Spinner";

/**
 * The spinner that goes inside a button mid-submit, beside the label.
 *
 * Every submit button in the app previously just swapped its label ("Log in"
 * becomes "Logging in..."). The label swap is kept — it is the clearest signal
 * of what is happening — and this puts a spinner next to it.
 *
 * The host button needs `inline-flex items-center justify-center gap-2` so the
 * spinner and the label sit on one centred row; without it the spinner is an
 * inline box against the text with no gap and a wobbly baseline. Every call
 * site in the app already carries those classes.
 *
 * Renders nothing when inactive rather than an invisible placeholder, because
 * the host button uses `gap-2` — an empty span would leave a gap beside the
 * label in the resting state.
 *
 * The accessible label is empty: the button's own text already says what is
 * happening, and repeating it would have a screen reader announce it twice.
 */
export function ButtonSpinner({ active }: { active: boolean }) {
  if (!active) return null;
  return <Spinner size="sm" label="" />;
}
