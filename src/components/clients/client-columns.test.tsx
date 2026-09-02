import { describe, expect, it, vi } from 'vitest';
import { clientColumns } from './client-columns';
import { t } from '@/lib/i18n';

/**
 * RBAC-03 on the client directory: which COLUMNS survive a viewer's field mask.
 *
 * The bug this exists for was reported from the running console: "when I
 * choose to hide a first name only, both first and last name are hidden." The
 * gate read `!hidden(firstName) && !hidden(lastName)` — keep the column only
 * if BOTH are permitted — so masking either half removed the whole Name
 * column, and a surname the operator was entitled to read went with it.
 *
 * They are separate entries in the backend catalog with separate aliases, so
 * the server strips exactly the one that was masked. Nothing had to render a
 * partial name: the cell already joins the parts it was given.
 */

const base = {
  canSuspend: true,
  canViewTags: true,
  canEditPartners: true,
  actingId: null,
  onToggleStatus: vi.fn(),
  onChangeProgram: vi.fn(),
};

const headersFor = (maskedFields: string[]) =>
  clientColumns({ ...base, maskedFields }).map((c) =>
    typeof c.header === 'string' ? c.header : '',
  );

const nameColumn = (maskedFields: string[]) =>
  clientColumns({ ...base, maskedFields }).find((c) => c.header === t('clients.colName'));

describe('clientColumns — the field mask', () => {
  it('keeps the Name column when only the FIRST name is hidden', () => {
    // The reported bug, stated directly.
    expect(headersFor(['client.firstName'])).toContain(t('clients.colName'));
  });

  it('keeps the Name column when only the LAST name is hidden', () => {
    expect(headersFor(['client.lastName'])).toContain(t('clients.colName'));
  });

  it('drops the Name column only when there is nothing left to put in it', () => {
    expect(headersFor(['client.firstName', 'client.lastName'])).not.toContain(t('clients.colName'));
  });

  it('renders the half that survived, and only that half', () => {
    /*
     * The server omits the masked field from the row, so the cell joining
     * `[firstName, lastName]` degrades on its own. Asserted anyway, because
     * the alternative — a component that reads the mask and reconstructs the
     * name — is what somebody would build to "fix" this, and it would put the
     * hidden half back on screen the day the server stopped stripping it.
     */
    const cell = nameColumn(['client.firstName'])?.cell;
    const rendered = cell?.({ id: 'c1', lastName: 'Haddad' } as never);
    expect(JSON.stringify(rendered)).toContain('Haddad');
    expect(JSON.stringify(rendered)).not.toContain('undefined');
  });

  it('stops offering the name SORT when the first name is hidden', () => {
    /*
     * The API orders by `users.first_name`, so a sortable header for a viewer
     * who cannot read that column is an ordering oracle: one click and the
     * alphabetical sequence of names they may not see sits beside the ids.
     */
    expect(nameColumn(['client.firstName'])?.sortable).toBe(false);
    expect(nameColumn([])?.sortable).toBe(true);
  });

  it('never offers a sort the API refuses', () => {
    /*
     * The other half of the same failure, and the one that took the whole
     * table down: `sortKey: 'type'` was offered while `CLIENT_SORT_COLUMNS`
     * has never contained it, so clicking the Type header returned R-2.5's
     * 400 and the list was replaced by an error card. `CLIENT_SORT_KEYS` is
     * derived from the generated OpenAPI contract now, so this cannot be
     * reintroduced without a compile error — this asserts the outcome.
     */
    const ALLOWED = ['createdAt', 'email', 'firstName', 'status', 'verificationLevel', 'country'];
    for (const column of clientColumns({ ...base, maskedFields: [] })) {
      if (column.sortable === false || !column.sortKey) continue;
      expect(ALLOWED, `column "${String(column.header)}" offers sort=${column.sortKey}`).toContain(
        column.sortKey,
      );
    }
  });

  it('leaves the Type column unsortable', () => {
    const type = clientColumns({ ...base, maskedFields: [] }).find(
      (c) => c.header === t('clients.colType'),
    );
    expect(type?.sortable).toBe(false);
  });
});
