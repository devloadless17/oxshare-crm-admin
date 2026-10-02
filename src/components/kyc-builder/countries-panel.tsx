'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe2, Save } from 'lucide-react';
import { adminApi, type OfferedCountries } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { ChipInput } from '@/components/ui/chip-input';
import { COUNTRY_ALIASES } from '@/lib/country-aliases';
import { toastError, toastSuccess } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * THE COUNTRIES OFFERED (backend 0178) — one list for the whole platform:
 * sign-up, verification, the client's details and payment-method rules.
 * Chosen as chips from the world list, so a typo can never become a country.
 */
export function CountriesPanel({ canEdit }: { canEdit: boolean }) {
  const countries = useResource<OfferedCountries>(keys.countries.all(), (signal) =>
    adminApi.getCountries(signal),
  );

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-border bg-card p-5">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Globe2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('countries.title')}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('countries.subtitle')}</p>
        {!canEdit && <p className="text-xs font-medium text-warning">{t('countries.readOnly')}</p>}
      </header>
      <AsyncBoundary
        status={countries.status}
        label={t('countries.loading')}
        endpoints={['GET /admin/countries']}
        onRetry={() => void countries.refetch()}
        errorMessage={t('countries.loadFailed')}
        error={countries.error}
      >
        {countries.data && (
          // Keyed on the saved list, so a save (anyone's) starts the editor from it.
          <CountriesEditor
            key={(countries.data.offered ?? []).join()}
            data={countries.data}
            canEdit={canEdit}
          />
        )}
      </AsyncBoundary>
    </section>
  );
}

type Mode = 'all' | 'except' | 'only';

/** Show the SHORT side: a broker usually offers nearly everything and leaves out a few. */
function initialState(data: OfferedCountries): { mode: Mode; chips: string[] } {
  if (data.offered === null) return { mode: 'all', chips: [] };
  const offered = new Set(data.offered);
  if (data.offered.length > data.world.length / 2) {
    return { mode: 'except', chips: data.world.map((c) => c.code).filter((c) => !offered.has(c)) };
  }
  return { mode: 'only', chips: [...data.offered] };
}

const MODES: {
  value: Mode;
  label: 'countries.modeAll' | 'countries.modeExcept' | 'countries.modeOnly';
}[] = [
  { value: 'all', label: 'countries.modeAll' },
  { value: 'except', label: 'countries.modeExcept' },
  { value: 'only', label: 'countries.modeOnly' },
];

function CountriesEditor({ data, canEdit }: { data: OfferedCountries; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const start = React.useMemo(() => initialState(data), [data]);
  const [mode, setMode] = React.useState<Mode>(start.mode);
  const [chips, setChips] = React.useState<string[]>(start.chips);
  const options = React.useMemo(
    () =>
      data.world.map((country) => ({
        value: country.code,
        label: country.name,
        aliases: COUNTRY_ALIASES[country.code] ?? [],
      })),
    [data.world],
  );
  const total = data.world.length;

  // What would be saved: the offered codes, in the world list's order.
  const offered = React.useMemo(() => {
    if (mode === 'all') return data.world.map((c) => c.code);
    if (mode === 'only') return chips;
    const out = new Set(chips);
    return data.world.map((c) => c.code).filter((c) => !out.has(c));
  }, [mode, chips, data.world]);

  const savedKey = (data.offered ?? data.world.map((c) => c.code)).join();
  const dirty = offered.join() !== savedKey;
  const invalid = offered.length === 0 || (mode !== 'all' && chips.length === 0);

  const save = useMutation({
    mutationFn: () => adminApi.setCountries(offered),
    onSuccess: async () => {
      toastSuccess(t('countries.saved'));
      // The KYC form's dropdowns follow the list.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.countries.all() }),
        queryClient.invalidateQueries({ queryKey: keys.kyc.all() }),
        // And the client Edit dialog's lists: `GET /profile/options` serves
        // the offered countries (backend 0178).
        queryClient.invalidateQueries({ queryKey: keys.profileOptions.all() }),
      ]);
    },
    onError: (error) => toastError(error, t('countries.saveFailed')),
  });

  const name = React.useId();
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t('countries.title')} className="flex flex-wrap gap-2">
        {MODES.map((choice) => {
          const checked = mode === choice.value;
          return (
            <label
              key={choice.value}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                checked ? 'border-ring bg-primary/10 font-semibold' : 'border-border'
              } ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
            >
              <input
                type="radio"
                name={name}
                checked={checked}
                disabled={!canEdit || save.isPending}
                onChange={() => {
                  setMode(choice.value);
                  setChips([]);
                }}
                className="accent-primary"
              />
              {t(choice.label)}
            </label>
          );
        })}
      </div>

      {mode !== 'all' && (
        <ChipInput
          value={chips}
          onChange={setChips}
          options={options}
          collapseAfter={12}
          ariaLabel={mode === 'except' ? t('countries.exceptAria') : t('countries.onlyAria')}
          placeholder={t('countries.placeholder')}
          disabled={!canEdit || save.isPending}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {mode === 'all'
            ? t('countries.summaryAll', { count: total })
            : t('countries.summaryOnly', { offered: offered.length, total })}
          {mode !== 'all' && chips.length === 0 && (
            <span className="ms-2 text-destructive">
              {mode === 'except' ? t('countries.emptyExcept') : t('countries.empty')}
            </span>
          )}
        </p>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={!dirty || invalid || save.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {save.isPending ? t('common.saving') : t('countries.save')}
          </Button>
        )}
      </div>
    </div>
  );
}
