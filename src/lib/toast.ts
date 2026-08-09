import { toast } from 'sonner';
import { apiErrorMessage, apiErrorRequestId } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

/**
 * The two lines every mutation in this console ends on.
 *
 * `sonner` is imported HERE and, apart from the host component, nowhere else.
 * That is the point of the module: 61 mutation call sites reaching into a toast
 * library directly would each make their own decision about wording, duration,
 * how to unwrap an axios error and whether to show a request id — and they would
 * differ, because they were written months apart. Two functions is what makes
 * "every write reports its outcome" a rule rather than an aspiration.
 *
 * See `components/ui/toaster.tsx` for why the console needed them at all.
 */

/**
 * A write landed.
 *
 * Takes a RESOLVED string, not a message key: `t()` has a typed key and several
 * of these need interpolation (`{email}`, `{count}`), so building the sentence
 * at the call site keeps the key checked by the compiler. Passing a key through
 * here would have to widen to `string` and lose that.
 */
export function toastSuccess(message: string, description?: string): void {
  toast.success(message, description === undefined ? undefined : { description });
}

/**
 * A write did NOT land — and the operator has to be told why, not just that.
 *
 * ## The fallback is required
 *
 * Not optional with a generic default, because a generic default is what makes
 * every failure in the console read "Something went wrong". The caller knows
 * which action failed and is the only one who can say so.
 *
 * ## The request id rides along
 *
 * R-6.1: every request carries `X-Request-Id` and the API stamps it on every log
 * line. An operator reading "Insufficient balance" needs no more; an operator
 * reading a 500 needs the one string that turns "it broke" into a ticket
 * somebody can grep. It goes in the DESCRIPTION rather than the title so it
 * never competes with the reason — and is omitted entirely when the error came
 * with none, rather than rendering an empty second line.
 *
 * ## Longer than a success
 *
 * A success is a confirmation of something already expected and can be missed
 * harmlessly. A failure is the whole reason the operator's next action changes,
 * and four seconds is not long enough to read a reason and copy an id.
 */
export function toastError(error: unknown, fallback: string): void {
  const requestId = apiErrorRequestId(error);
  toast.error(apiErrorMessage(error, fallback), {
    duration: 8000,
    description: requestId ? t('common.requestId', { id: requestId }) : undefined,
  });
}
