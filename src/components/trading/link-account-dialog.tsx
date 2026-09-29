'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Link2, Search } from 'lucide-react';
import api from '@/lib/api';
import type { ClientListResponse, ClientRow, Mt5AccountLookup } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { useDebounced } from '@/hooks/use-debounced';
import { apiErrorMessage } from '@/lib/api/errors';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SearchField } from '@/components/ui/search-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClientIdentity, clientName } from '@/components/clients/client-identity';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { toastSuccess } from '@/lib/toast';

/** The client the account is linked to — the profile hands it over pre-filled. */
export interface LinkTarget {
  id: number;
  portalId: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  country?: string | null;
}

/**
 * LINK AN EXISTING MT5 ACCOUNT TO A CLIENT (owner, 29 Sep 2026).
 *
 * The broker's server holds accounts the CRM never recorded — opened in the
 * manager terminal, or on the platform this one replaced — and their trades pay
 * no partner until the login belongs to somebody. The flow the owner asked for:
 *
 *   1. the CLIENT — searched here, or already known when opened from a profile;
 *   2. the ACCOUNT — looked up by login on MT5;
 *   3. both SIDE BY SIDE, so the operator confirms they are the same person;
 *   4. the PRODUCT whose commission terms its trades pay;
 *   5. link — and the deals waiting on that login accrue on the next run.
 *
 * The server repeats every check (a login already owned, one MT5 does not have,
 * a product that does not sell the group); this screen only makes them visible
 * before the click.
 */
export function LinkAccountDialog({
  open,
  onClose,
  client: fixedClient,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-filled from a client's profile or row; absent from the accounts desk. */
  client?: LinkTarget;
}) {
  return (
    <Modal open={open} onClose={onClose} title={t('linkAccount.title')} size="lg">
      {/* Keyed: reopening starts clean rather than on the last attempt's state. */}
      {open && (
        <LinkAccountForm
          key={fixedClient?.id ?? 'new'}
          fixedClient={fixedClient}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function LinkAccountForm({
  fixedClient,
  onClose,
}: {
  fixedClient?: LinkTarget;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [client, setClient] = React.useState<LinkTarget | null>(fixedClient ?? null);
  const [login, setLogin] = React.useState('');
  const [lookup, setLookup] = React.useState<Mt5AccountLookup | null>(null);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [looking, setLooking] = React.useState(false);
  const [productId, setProductId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [linked, setLinked] = React.useState<{ login: string; waitingDeals: number } | null>(null);

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = login.trim();
    if (!trimmed) return;
    setLooking(true);
    setLookup(null);
    setLookupError(null);
    setError(null);
    try {
      const found = await api.admin.lookupMt5Account(trimmed);
      setLookup(found);
      // One product sells the group → it is the answer; several → the operator picks.
      setProductId(found.products.length === 1 ? (found.products[0]?.id ?? '') : '');
    } catch (err) {
      setLookupError(apiErrorMessage(err, t('linkAccount.lookupFailed')));
    } finally {
      setLooking(false);
    }
  };

  const blocked = lookup !== null && (lookup.owner !== null || !lookup.currencyKnown);
  const needsProduct = lookup !== null && lookup.products.length > 1 && !productId;
  const canLink = client !== null && lookup !== null && !blocked && !needsProduct && !saving;

  const link = async () => {
    if (!client || !lookup) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.admin.linkMt5Account({
        userId: client.id,
        login: lookup.login,
        ...(productId ? { productId } : {}),
      });
      setLinked({ login: result.login, waitingDeals: result.waitingDeals });
      toastSuccess(t('linkAccount.succeeded', { login: result.login }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.tradingAccounts.all() }),
        queryClient.invalidateQueries({ queryKey: keys.clients.detail(client.portalId) }),
      ]);
    } catch (err) {
      setError(apiErrorMessage(err, t('linkAccount.failed')));
    } finally {
      setSaving(false);
    }
  };

  if (linked) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{t('linkAccount.doneTitle', { login: linked.login })}</p>
            <p className="text-muted-foreground">
              {linked.waitingDeals > 0
                ? t('linkAccount.doneWaiting', { count: String(linked.waitingDeals) })
                : t('linkAccount.doneNoWaiting')}
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            {t('clientProfile.done')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1 — the client */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t('linkAccount.stepClient')}
        </h3>
        {client ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <ClientIdentity
              name={clientName(client.firstName, client.lastName)}
              email={client.email}
              portalId={client.portalId}
              link={false}
            />
            {!fixedClient && (
              <Button type="button" size="sm" variant="outline" onClick={() => setClient(null)}>
                {t('linkAccount.changeClient')}
              </Button>
            )}
          </div>
        ) : (
          <ClientPicker onPick={setClient} />
        )}
      </section>

      {/* 2 — the account */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t('linkAccount.stepAccount')}
        </h3>
        <form onSubmit={(e) => void find(e)} className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="link-login">{t('linkAccount.loginLabel')}</Label>
            <Input
              id="link-login"
              value={login}
              onChange={(e) => setLogin(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="5000123"
              className="font-mono"
            />
          </div>
          <Button type="submit" variant="outline" loading={looking} disabled={!login.trim()}>
            <Search className="h-4 w-4" aria-hidden="true" />
            {t('linkAccount.find')}
          </Button>
        </form>
        {lookupError && (
          <p role="alert" className="text-xs text-destructive">
            {lookupError}
          </p>
        )}
      </section>

      {/* 3 — side by side */}
      {lookup && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('linkAccount.stepCompare')}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Side title={t('linkAccount.sideClient')}>
              {client ? (
                <>
                  <Row label={t('linkAccount.name')}>
                    {clientName(client.firstName, client.lastName) ?? '—'}
                  </Row>
                  <Row label={t('linkAccount.email')}>{client.email ?? '—'}</Row>
                  <Row label={t('linkAccount.portalId')}>#{client.portalId}</Row>
                  {client.country && <Row label={t('linkAccount.country')}>{client.country}</Row>}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{t('linkAccount.pickClientFirst')}</p>
              )}
            </Side>
            <Side title={t('linkAccount.sideMt5', { login: lookup.login })}>
              <Row label={t('linkAccount.name')}>{lookup.holderName ?? '—'}</Row>
              <Row label={t('linkAccount.email')}>{lookup.holderEmail ?? '—'}</Row>
              <Row label={t('linkAccount.group')}>
                <span className="font-mono text-xs">{lookup.group}</span>
              </Row>
              <Row label={t('linkAccount.balance')}>
                <span className="tabular">{formatMoney(lookup.balance, lookup.currency)}</span>
              </Row>
              <Row label={t('linkAccount.leverage')}>1:{lookup.leverage}</Row>
              <Row label={t('linkAccount.environment')}>
                <Badge variant={lookup.environment === 'demo' ? 'outline' : 'default'}>
                  {lookup.environment === 'demo'
                    ? t('tradingAccounts.envDemo')
                    : t('tradingAccounts.envLive')}
                </Badge>
              </Row>
            </Side>
          </div>

          {client && namesDiffer(client, lookup) && (
            <Notice tone="warning">{t('linkAccount.namesDiffer')}</Notice>
          )}
          {lookup.owner && (
            <Notice tone="error">
              {lookup.owner.outsideTerritory
                ? t('linkAccount.ownedOutside')
                : t('linkAccount.ownedBy', {
                    who: lookup.owner.name || `#${lookup.owner.portalId}`,
                  })}
            </Notice>
          )}
          {!lookup.currencyKnown && (
            <Notice tone="error">
              {t('linkAccount.currencyUnknown', { currency: lookup.currency })}
            </Notice>
          )}
          {lookup.waitingDeals > 0 && !blocked && (
            <p className="text-xs text-muted-foreground">
              {t('linkAccount.waitingDeals', { count: String(lookup.waitingDeals) })}
            </p>
          )}
        </section>
      )}

      {/* 4 — the product */}
      {lookup && !blocked && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('linkAccount.stepProduct')}
          </h3>
          {lookup.products.length === 0 ? (
            <Notice tone="warning">{t('linkAccount.noProduct', { group: lookup.group })}</Notice>
          ) : (
            <div className="space-y-1.5">
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger aria-label={t('linkAccount.productLabel')}>
                  <SelectValue placeholder={t('linkAccount.productPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {lookup.products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t('linkAccount.productHint')}</p>
            </div>
          )}
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="button" onClick={() => void link()} disabled={!canLink} loading={saving}>
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {t('linkAccount.link')}
        </Button>
      </div>
    </div>
  );
}

/** Search the client base by name, email or Portal ID — the server's own search. */
function ClientPicker({ onPick }: { onPick: (client: LinkTarget) => void }) {
  const [search, setSearch] = React.useState('');
  const q = useDebounced(search.trim());
  const params = { limit: 8, q };
  const query = useResource<ClientListResponse>(
    keys.clients.list(params),
    (signal) => api.admin.getClients(params, signal),
    { enabled: q.length >= 2 },
  );
  const rows = q.length >= 2 ? (query.data?.items ?? []) : [];
  return (
    <div className="space-y-2">
      <SearchField
        value={search}
        onChange={setSearch}
        label={t('linkAccount.clientSearch')}
        placeholder={t('linkAccount.clientSearchPlaceholder')}
        className="w-full"
      />
      {q.length >= 2 && (
        <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {query.status === 'loading' ? (
            <li className="p-3 text-xs text-muted-foreground">{t('linkAccount.searching')}</li>
          ) : rows.length === 0 ? (
            <li className="p-3 text-xs text-muted-foreground">{t('linkAccount.noClients')}</li>
          ) : (
            rows.map((row: ClientRow) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() =>
                    onPick({
                      id: row.id,
                      portalId: row.portalId,
                      firstName: row.firstName,
                      lastName: row.lastName,
                      email: row.email,
                      country: row.country,
                    })
                  }
                  className="w-full p-3 text-left hover:bg-accent/40 focus-outline"
                >
                  <ClientIdentity
                    name={clientName(row.firstName, row.lastName)}
                    email={row.email}
                    portalId={row.portalId}
                    link={false}
                  />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function Side({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warning' | 'error'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
        tone === 'error'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-warning/30 bg-warning/10 text-warning'
      }`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * A soft check, never a refusal: MT5 names are free text typed years ago, so a
 * mismatch is a prompt to look twice, not proof of a wrong account.
 */
function namesDiffer(client: LinkTarget, lookup: Mt5AccountLookup): boolean {
  if (!lookup.holderName) return false;
  const crm = clientName(client.firstName, client.lastName);
  if (!crm) return false;
  const norm = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  const words = norm(lookup.holderName).split(' ');
  return !norm(crm)
    .split(' ')
    .some((word) => word.length > 1 && words.includes(word));
}
