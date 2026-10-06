import { PageLoader } from '@/components/ui/loader';
import { t } from '@/lib/i18n';

/**
 * The console's loading boundary — what makes a sidebar click feel instant.
 *
 * Every console route is DYNAMIC (the root layout reads `headers()` for the CSP
 * nonce and `cookies()` for the session hint), and Next.js 16 prefetches a
 * dynamic route ONLY when it has a `loading.js` boundary
 * (node_modules/next/dist/docs/01-app/02-guides/prefetching.md). Without this
 * file nothing was prefetched: a click waited for the server to render the new
 * page while the OLD one stayed on screen, so the sidebar already showed
 * "Audit log" over the Network access page (reported 6 Oct 2026).
 *
 * With it, each visible link prefetches the layout down to this boundary, so a
 * click swaps the page for this loader at once and the page streams in behind
 * it. The sidebar is in the layout above, so it never blinks. The loader is the
 * same one `AsyncBoundary` shows while the page's own data loads, so the two
 * waits read as one.
 */
export default function ConsoleLoading() {
  return <PageLoader label={t('common.loading')} srOnly />;
}
