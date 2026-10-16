'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import api from '@/lib/api';
import type { LedgerStatementResponse } from '@/lib/api/admin';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * THE PERIOD STATEMENT (backend audit R4-G1): for the period the Ledger page shows, per currency
 * and wallet kind, the client money held at the start, every posting by type, and held at the
 * end — the SERVER's figures, never added up here (§6.1). Collapsed until asked for, so the page
 * pays nothing for it; without a start it is the liabilities at the end.
 */
export function LedgerStatementPanel({ from, to }: { from?: string; to?: string }) {
  const [open, setOpen] = useState(false);
  const params = { from, to };
  const query = useResource<LedgerStatementResponse>(
    keys.ledger.statement(params),
    (signal) => api.admin.getLedgerStatement(params, signal),
    { enabled: open },
  );
  const report = query.data;

  return (
    <section className="shrink-0 rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="focus-outline flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
      >
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">{t('ledger.statement.title')}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="border-t px-4 py-3">
          <AsyncBoundary
            status={query.status}
            label={t('ledger.statement.loading')}
            endpoints={['GET /admin/ledger/statement']}
            onRetry={query.refetch}
          >
            {report && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">{t('ledger.statement.scope')}</p>
                {report.statements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('ledger.statement.empty')}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground">
                        <th className="py-1 pr-3 font-medium">{t('ledger.statement.colMoney')}</th>
                        <th className="py-1 pr-3 text-right font-medium">
                          {t('ledger.statement.colOpening')}
                        </th>
                        <th className="py-1 pr-3 font-medium">
                          {t('ledger.statement.colPostings')}
                        </th>
                        <th className="py-1 pr-3 text-right font-medium">
                          {t('ledger.statement.colMovement')}
                        </th>
                        <th className="py-1 text-right font-medium">
                          {t('ledger.statement.colClosing')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.statements.map((row) => (
                        <tr
                          key={`${row.currency}-${row.walletKind}`}
                          className="border-t align-top"
                        >
                          <td className="py-2 pr-3 font-medium">
                            {row.currency} ·{' '}
                            {row.walletKind === 'commission'
                              ? t('ledger.statement.kindCommission')
                              : t('ledger.statement.kindMain')}
                          </td>
                          <td className="tabular py-2 pr-3 text-right">
                            {formatMoney(row.opening, row.currency)}
                          </td>
                          <td className="py-2 pr-3">
                            <ul className="flex flex-col gap-0.5 text-xs">
                              {row.lines.map((line) => (
                                <li key={`${line.entryType}-${line.flow}`}>
                                  {t(
                                    line.flow === 'in'
                                      ? 'ledger.statement.lineIn'
                                      : 'ledger.statement.lineOut',
                                    {
                                      type: line.entryType,
                                      count: line.count,
                                      amount: formatMoney(line.total, row.currency),
                                    },
                                  )}
                                </li>
                              ))}
                              {row.lines.length === 0 && (
                                <li className="text-muted-foreground">
                                  {t('ledger.statement.noPostings')}
                                </li>
                              )}
                            </ul>
                          </td>
                          <td className="tabular py-2 pr-3 text-right">
                            {formatMoney(row.movement, row.currency)}
                          </td>
                          <td className="tabular py-2 text-right font-semibold">
                            {formatMoney(row.closing, row.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p
                  className={`flex items-center gap-1.5 text-xs ${report.walletsAgreeWithLedger ? 'text-success' : 'font-semibold text-destructive'}`}
                >
                  {report.walletsAgreeWithLedger ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t(
                    report.walletsAgreeWithLedger
                      ? 'ledger.statement.exact'
                      : 'ledger.statement.notExact',
                    { at: new Date(report.reconciledAt).toLocaleString() },
                  )}
                </p>
              </div>
            )}
          </AsyncBoundary>
        </div>
      )}
    </section>
  );
}
