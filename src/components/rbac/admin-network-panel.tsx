'use client';

import { t } from '@/lib/i18n';

/*
 * RBAC-08 per administrator (0224): from where one administrator may sign in.
 *
 * Either from anywhere, or only from the addresses typed here. There is no
 * global network list any more — the Network access page went with it — so the
 * invite and the edit form are the only places this is decided. The API
 * canonicalises, de-duplicates and re-validates; this only catches typos early.
 */

const IPV4 = String.raw`(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}`;
const IPV4_OR_CIDR = new RegExp(`^${IPV4}(/(3[0-2]|[12]?\\d))?$`);

/** The typed text as a list — one per line, commas and spaces tolerated. */
export function parseIpList(text: string): { ips: string[]; invalid: string | null } {
  const ips: string[] = [];
  for (const value of text.split(/[\s,]+/)) {
    if (value === '') continue;
    if (!IPV4_OR_CIDR.test(value)) return { ips, invalid: value };
    if (!ips.includes(value)) ips.push(value);
  }
  return { ips, invalid: null };
}

/**
 * What the form sends, or the message to show instead. `null` when the
 * selection is valid but empty is impossible: a restricted administrator with
 * no address could never sign in, and the API refuses it too.
 */
export function networkSelection(
  accessAnywhere: boolean,
  ipsText: string,
): { value: { accessAnywhere: boolean; allowedIps: string[] } } | { error: string } {
  if (accessAnywhere) return { value: { accessAnywhere: true, allowedIps: [] } };
  const { ips, invalid } = parseIpList(ipsText);
  if (invalid !== null) return { error: t('adminUsers.network.invalid', { value: invalid }) };
  if (ips.length === 0) return { error: t('adminUsers.network.required') };
  return { value: { accessAnywhere: false, allowedIps: ips } };
}

export function AdminNetworkPanel({
  accessAnywhere,
  onAccessAnywhereChange,
  ipsText,
  onIpsTextChange,
  disabled,
  disabledReason,
  idPrefix,
}: {
  accessAnywhere: boolean;
  onAccessAnywhereChange: (value: boolean) => void;
  /** The raw textarea contents — parsed on submit, so nothing typed is lost. */
  ipsText: string;
  onIpsTextChange: (value: string) => void;
  disabled?: boolean;
  /** Shown instead of the controls' hint, with the controls disabled. */
  disabledReason?: string;
  /** Keeps the textarea id unique when two forms are mounted. */
  idPrefix: string;
}) {
  const locked = disabled || Boolean(disabledReason);
  const ipsId = `${idPrefix}-allowed-ips`;
  return (
    <div className="space-y-3">
      {disabledReason && <p className="text-[11px] text-muted-foreground">{disabledReason}</p>}
      <div
        role="radiogroup"
        aria-label={t('adminUsers.network.section')}
        className="grid grid-cols-2 gap-2"
      >
        {[
          { value: false, label: t('adminUsers.network.onlyIps') },
          { value: true, label: t('adminUsers.network.anywhere') },
        ].map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={accessAnywhere === option.value}
            disabled={locked}
            onClick={() => onAccessAnywhereChange(option.value)}
            className="focus-outline rounded-lg border border-border px-3 py-2 text-xs font-semibold aria-checked:border-ring aria-checked:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {option.label}
          </button>
        ))}
      </div>
      {accessAnywhere ? (
        <p className="text-[11px] text-muted-foreground">{t('adminUsers.network.anywhereHint')}</p>
      ) : (
        <div>
          <label className="font-semibold" htmlFor={ipsId}>
            {t('adminUsers.network.ipsLabel')}
          </label>
          <textarea
            id={ipsId}
            rows={3}
            value={ipsText}
            disabled={locked}
            onChange={(e) => onIpsTextChange(e.target.value)}
            placeholder={t('adminUsers.network.ipsPlaceholder')}
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('adminUsers.network.ipsHint')}
          </p>
        </div>
      )}
    </div>
  );
}
