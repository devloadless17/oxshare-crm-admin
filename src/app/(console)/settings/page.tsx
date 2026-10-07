'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Clock, Mail, MonitorDown, Sparkles } from 'lucide-react';
import { PageLoader } from '@/components/ui/loader';
import { AssistantSettingsPanel } from '@/components/rbac/assistant-settings-panel';
import { PlatformLinksPanel } from '@/components/rbac/platform-links-panel';
import { ScheduledJobsPanel } from '@/components/rbac/scheduled-jobs-panel';
import { SmtpSettingsPanel } from '@/components/rbac/smtp-settings-panel';

import { Tabs, TabPanel, type TabDefinition } from '@/components/ui/tabs';
import { useAdmin } from '@/context/AdminAuthContext';
import { hasPermission } from '@/lib/permissions';
import { t } from '@/lib/i18n';

/**
 * The operator's settings — three tabs over three independently-guarded
 * resources.
 *
 * Products and Agencies were briefly tabs here and are now their own pages at
 * `/products` and `/agencies`. They outgrew a settings tab the moment they
 * needed a table with row actions: a tab is for a form an operator fills in
 * once, and a catalogue is a list they work through.
 *
 * ── This is not the tab strip that was removed ─────────────────────────────
 *
 * An earlier version of this page carried roles and the admin directory behind
 * tabs, and splitting those out to `/roles` and `/admin-users` was right: they
 * are their own screens, with their own permissions, their own deep links and
 * their own place in the sidebar. Nothing here re-litigates that. These three
 * are configuration — things an operator sets once and revisits rarely — and
 * they were already stacked on one page. Tabs give them room to be filled in
 * without turning the page into a scroll.
 *
 * A Security tab (the RBAC-08 network allowlist) also lived here. It is its own
 * page now, `/network-access`, under Security in the sidebar (25 Sep 2026): it
 * decides who can reach the console at all, which is a security control and
 * not configuration. A `?tab=security` bookmark is sent there — see below.
 *
 * ── The active tab lives in the URL ────────────────────────────────────────
 *
 * `?tab=email` is linkable, survives a refresh, and gives Back somewhere to go.
 * A bookmark to the removed `?tab=general` now lands on Trading — see the
 * fallback below, which is the reason it exists. `?tab=security` is the one
 * exception: that panel still exists, on its own page, so it is redirected
 * there rather than silently swapped for Trading.
 * The alternative — `useState` — makes "the SMTP settings are under Settings →
 * Email" un-sendable, which on a screen whose whole audience is two or three
 * administrators talking to each other is most of its value.
 *
 * `replace` rather than `push`, matching `use-table-query-state.ts`: clicking
 * through four tabs should not bury the page the operator arrived from under
 * four history entries.
 *
 * ⚠️ `useSearchParams()` needs a `<Suspense>` boundary at prerender or
 * `npm run build` fails — and `next dev` does not, so CI is where you find out.
 * That is what the default export below is.
 *
 * ── Which tabs exist depends on who is asking ──────────────────────────────
 *
 * The Email tab is master-admin-only, so a sub-admin does not see it at all
 * rather than seeing it 403. The API enforces this independently — client-side
 * gating here is UX, not security.
 */
function AdminSettingsContent() {
  const { admin } = useAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const canManageSettings = hasPermission(admin, 'settings.edit');
  /*
   * SMTP and the security switches were MASTER-ADMIN-ONLY, and there is no
   * master admin any more — no role sits above another, so "not delegatable at
   * all" had to become a key somebody can be given deliberately.
   *
   * They stay separate from `settings.edit` rather than folding into it: mail
   * credentials and the security switches are a different order of trust from
   * the support email, and one grant covering all three is how the narrow one
   * gets handed out for the sake of the broad one.
   */
  const canViewSmtp = hasPermission(admin, 'settings.smtp.view');
  /*
   * No Payments tab any more: the Rival connection is a payment provider,
   * managed under System → Payment providers beside the methods that run on
   * it (backend 0168).
   */
  const canEditSmtp = hasPermission(admin, 'settings.smtp.edit');

  const tabs = React.useMemo<TabDefinition[]>(() => {
    const all: (TabDefinition | null)[] = [
      /*
       * FIRST, so it is what the screen opens on — and visible to every admin,
       * unlike Email, which is permission-gated: a default tab some operators
       * cannot see is a screen that opens on a fallback.
       *
       * Trading held this position until 7 Oct 2026 (owner): its demo ceiling
       * was removed and its commission cadence lives in Scheduled jobs, so it
       * had nothing left to save and went.
       */
      {
        value: 'platforms',
        label: t('settings.tabPlatforms'),
        icon: <MonitorDown className="h-4 w-4" aria-hidden="true" />,
      },
      /*
       * The SMTP tab, on `settings.smtp.view` rather than on being the master
       * admin. Same tab, same panel; the difference is that somebody can now be
       * given it deliberately instead of it being reachable by exactly one
       * hard-coded account.
       */
      canViewSmtp
        ? {
            value: 'email',
            label: t('settings.tabEmail'),
            icon: <Mail className="h-4 w-4" aria-hidden="true" />,
          }
        : null,
      /*
       * Every background job's timing (owner, 29 Sep 2026), edited here rather
       * than in the server's environment file. Visible to every admin like
       * Platforms; the controls need `settings.edit`.
       */
      {
        value: 'jobs',
        label: t('settings.tabJobs'),
        icon: <Clock className="h-4 w-4" aria-hidden="true" />,
      },
      // The portal assistant (backend 0187): its switch, limits and today's usage.
      {
        value: 'assistant',
        label: t('settings.tabAssistant'),
        icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
      },
    ];
    return all.filter((tab): tab is TabDefinition => tab !== null);
  }, [canViewSmtp]);

  /*
   * An unknown or forbidden `?tab=` falls back to the first tab rather than
   * rendering an empty screen. A stale link — to `general`, whose tab no longer
   * exists, or to `email` shared with a sub-admin who cannot see it — is a
   * thing that happens, and landing on Platforms beats a blank panel.
   */
  const requested = searchParams.get('tab') ?? '';

  /*
   * The Security tab moved to its own page. A link to it is REDIRECTED rather
   * than left to the Platforms fallback: the operator asked for the allowlist,
   * which still exists, and landing elsewhere would read as the allowlist
   * having been removed. The page's own route gate decides
   * whether they may see it.
   */
  React.useEffect(() => {
    if (requested === 'security') router.replace('/network-access');
  }, [requested, router]);
  // `tabs` always has Platforms, so the fallback is never reached — it exists
  // because the compiler cannot know that from the filter.
  const active = tabs.some((tab) => tab.value === requested)
    ? requested
    : (tabs[0]?.value ?? 'platforms');

  const setActive = React.useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('settings.subtitle')}</p>
      </div>

      <div>
        <Tabs tabs={tabs} value={active} onValueChange={setActive} idPrefix="settings" />

        {/* Master admin only, and the API refuses anyone else regardless. */}
        <TabPanel value="email" activeValue={active} idPrefix="settings">
          {/*
            Gated like the other two panels. It took no prop before, because the
            TAB was master-admin-only and reaching the panel at all was the
            permission. Now that `settings.smtp.view` opens the tab, viewing and
            changing mail credentials are separable — and without this a
            read-only holder would get editable fields that 403 on save.
          */}
          <SmtpSettingsPanel canManage={canEditSmtp} />
        </TabPanel>

        <TabPanel value="jobs" activeValue={active} idPrefix="settings">
          <ScheduledJobsPanel canManage={canManageSettings} />
        </TabPanel>

        <TabPanel value="assistant" activeValue={active} idPrefix="settings">
          <AssistantSettingsPanel canManage={canManageSettings} />
        </TabPanel>

        <TabPanel value="platforms" activeValue={active} idPrefix="settings">
          {/*
            Rendered for EVERY admin, with the controls disabled without
            `settings.edit`, rather than hidden like the Email tab. The two are
            different kinds of secret: where the mail relay points is worth
            withholding, whereas which platforms have a download is something an
            operator needs to look up without holding a permission they do not
            need. The API refuses the write regardless.
          */}
          <PlatformLinksPanel canManage={canManageSettings} />
        </TabPanel>
      </div>
    </div>
  );
}

/*
 * `PageLoader`, like every other console page's boundary — audit-log, clients,
 * commissions, trading-accounts, transactions and wallets all pass it already.
 * This one hand-built a line of muted text instead, so the settings screen was
 * the only one that loaded differently, and it brought none of what the shared
 * loader does: the spinner, `role="status"` with `aria-live`, and a mark that
 * keeps moving under reduce-motion.
 */
export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<PageLoader label={t('common.loading')} />}>
      <AdminSettingsContent />
    </Suspense>
  );
}
