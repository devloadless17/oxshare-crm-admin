import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';

/** Copy a sign-up link and say so — or say how to copy it by hand. */
export async function copySignupLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toastSuccess(t('signup.copied'), url);
  } catch (error) {
    toastError(error, t('signup.copyFailed'));
  }
}
