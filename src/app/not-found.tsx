import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * A missing route or a bad dynamic segment, inside the product rather than
 * outside it.
 *
 * `/clients/does-not-exist` used to fall through to the framework default, which
 * renders with no chrome and no way back — the same dead end as a render throw.
 */
export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <FileQuestion className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-lg font-bold text-foreground">{t('notFound.title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('notFound.body')}</p>
      <Link
        href="/dashboard"
        className="text-sm font-semibold text-link hover:underline focus-outline rounded-sm"
      >
        {t('session.backToDashboard')}
      </Link>
    </div>
  );
}
