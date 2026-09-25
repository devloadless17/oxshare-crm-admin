import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
/*
 * POSIX `join`, deliberately. Every path this file derives is compared with
 * forward-slash literals (route prefixes, frozen lists, `src/app/...` keys),
 * and the platform `join` hands back BACKSLASHES on Windows — which turned this
 * census into a wall of false failures on every developer machine while CI, on
 * Linux, stayed green. `readdirSync` accepts forward slashes on every platform.
 */
import { join } from 'node:path/posix';

/**
 * A SCREEN THAT SHOWS A PERSON'S ROWS MUST NAME THAT PERSON, AND MUST LET AN
 * OPERATOR NARROW TO THEM BY THE NAME IT SHOWED.
 *
 * ## The defect this exists to stop repeating
 *
 * The owner opened `/wallets`, read a table of named clients, and found the
 * filter above it saying **"Paste a client ID"**. There is no id on that screen
 * — every row shows an email and a name — so narrowing to the client he was
 * looking straight at meant leaving for `/clients`, copying a uuid, and coming
 * back. A filter you can only use by visiting another screen first is not a
 * filter.
 *
 * It was not one screen. The same defect was then found, one at a time, on
 * `/trading-accounts`, on `/ledger` (whose Client column rendered a bare uuid
 * as well), and on `/commissions`. The audit log had the harsher version of it:
 * two CATEGORY filters and no way to ask "what did this administrator do" or
 * "what has been done to this client", on the one record whose value is being
 * able to answer exactly that.
 *
 * Four instances of one shape, each found by a person looking. That is the
 * signal that a check belongs here rather than a fifth fix — the rule this repo
 * already follows for route tests, sort contracts and URL state.
 *
 * ## What it derives, and what it is told
 *
 * The SUBJECTS are derived from the file system and from the source: a file is
 * a person-table if one of its `cell:` renderers names a person or a person's
 * id. Nobody maintains that list, so a screen added tomorrow is covered without
 * anyone remembering this file exists.
 *
 * The EXEMPTIONS are declared, with a reason, and the list only shrinks. A
 * screen that genuinely should not be filterable says so out loud once.
 *
 * ## What it deliberately does NOT check
 *
 * It does not check that the filter WORKS — the page tests and the backend
 * specs do that, each with the predicate mutated to confirm the test fails for
 * the predicted reason. This checks that the control and the parameter exist at
 * all, which is the half that kept going missing.
 */

function walk(root: string, keep: (name: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) walk(path, keep, out);
    else if (keep(entry.name)) out.push(path);
  }
  return out.sort();
}

const pages = () => walk('src/app', (n) => n === 'page.tsx');
const sources = () => [
  ...walk('src/app', (n) => n.endsWith('.tsx') && !n.endsWith('.test.tsx')),
  ...walk('src/components', (n) => n.endsWith('.tsx') && !n.endsWith('.test.tsx')),
];

/**
 * Comments are stripped before anything is matched.
 *
 * Every one of these screens carries a paragraph explaining the defect it used
 * to have, and those paragraphs contain the words `userId`, "paste" and "client
 * id". Matching over them would make the fix itself look like the bug.
 */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Remove every `url.set({...})` call.
 *
 * GUARD 2 asks whether a search term reaches the API, and a search BOX writes
 * the same key into the URL — `url.set({ q: e.target.value })`. Matching that
 * would let a page keep its box, stop sending the parameter, and still pass:
 * the exact half-wired state `/ledger` was found in, where `q` was read from
 * the URL and never put into the request. Verified by mutation — deleting the
 * request line must turn GUARD 2 red.
 */
function withoutUrlWrites(source: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const at = source.indexOf('url.set(', i);
    if (at === -1) return out + source.slice(i);
    out += source.slice(i, at);
    let depth = 0;
    let j = at + 'url.set'.length;
    for (; j < source.length; j++) {
      const c = source.charAt(j);
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    i = j;
  }
}

/**
 * The body of every `cell:` renderer, by balanced delimiters.
 *
 * Per CELL rather than per file, because the question is what one COLUMN puts
 * in front of a reader. `/ledger` named the client in one column and printed a
 * raw uuid in another, and a file-level match would have called that fine.
 */
function cells(source: string): string[] {
  const found: string[] = [];
  const opener = /cell:\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    let depth = 0;
    let i = match.index + 'cell:'.length;
    for (; i < source.length; i++) {
      const c = source.charAt(i);
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (c === ',' && depth === 0) break;
    }
    found.push(source.slice(match.index, i));
  }
  return found;
}

/** A person's opaque key — names nobody, and cannot be typed from memory. */
const PERSON_ID = /\b(userId|clientId|ibUserId|clientUserId|actorId|subjectId)\b/;

/**
 * A person, in words. Deliberately narrow: a bare `name` matches a currency
 * name, a role name and a product name, and this file is about PEOPLE.
 */
const PERSON =
  /\b(email|firstName|lastName|fullName|clientName|partnerName|actorEmail)\b|\b\w+(Email|FirstName|LastName|FullName)\b/;

/** Column definitions live beside the page as often as inside it. */
const PERSON_COLUMN_MODULES = [
  'src/components/clients/client-columns.tsx',
  'src/components/financial/transaction-columns.tsx',
  'src/components/rbac/admin-directory-table.tsx',
];

/**
 * Screens that legitimately offer no way to narrow to one person.
 *
 * SHRINK-ONLY, like `UNTESTED` in the route census. Adding an entry means
 * writing down why a person cannot be searched for on a screen full of people,
 * which is a sentence worth having to write.
 */
const UNSEARCHABLE: Record<string, string> = {
  'src/app/(console)/reconciliation/page.tsx':
    'ADM-14 §12.2. A reconciliation reporting "balanced" over a SUBSET of clients is the ' +
    'opposite of what a reconciliation is for, so the endpoint takes no filter at all and ' +
    'the controller says so. The discrepancy rows name their client in words (that is ' +
    'GUARD 1, which this screen passes); what is refused here is narrowing the RUN.',
};

describe('GUARD 1 — a table that shows a person’s rows names the person', () => {
  const subjects = sources()
    .map((file) => ({ file, cells: cells(strip(readFileSync(file, 'utf8'))) }))
    .filter(({ cells: cs }) => cs.some((c) => PERSON_ID.test(c) || PERSON.test(c)));

  it('finds the person-tables in the console rather than being handed a list', () => {
    // The non-vacuity floor. Every case below is a `.every()` over this list,
    // and a derivation that silently stopped matching would pass all of them
    // while checking nothing. Measured 15 Sep 2026: 13.
    expect(subjects.length).toBeGreaterThanOrEqual(12);
  });

  it.each(
    sources()
      .map((file) => ({ file, cells: cells(strip(readFileSync(file, 'utf8'))) }))
      .filter(({ cells: cs }) => cs.some((c) => PERSON_ID.test(c) || PERSON.test(c)))
      .map(({ file, cells: cs }) => [file, cs] as const),
  )('%s names its subject in words, not only by id', (file, cs) => {
    /*
     * At least one column a person can READ. `/ledger` failed this: its Client
     * column rendered `r.userId`, a uuid, while the filter above it demanded
     * the same uuid — so the screen never told anyone whose money it was
     * showing, and the operator could not ask.
     *
     * One naming column is the bar, not every column: a "copy this id" cell is
     * a legitimate convenience once the row has already said who it belongs to.
     */
    const named = cs.filter((c) => PERSON.test(c));
    expect(named.length, `${file} shows a person's rows and no column names them`).toBeGreaterThan(
      0,
    );
  });
});

describe('GUARD 2 — a list of people can be narrowed to one of them', () => {
  function personLists() {
    return pages()
      .map((file) => ({ file, source: strip(readFileSync(file, 'utf8')) }))
      .filter(({ source }) => /<DataTable/.test(source))
      .filter(({ source }) => {
        const ownCells = cells(source);
        if (ownCells.some((c) => PERSON.test(c) || PERSON_ID.test(c))) return true;
        // Columns imported from a module that names people — `/clients` and
        // `/financial` both define their columns outside the page.
        return PERSON_COLUMN_MODULES.some((mod) =>
          source.includes('@/' + mod.replace(/^src\//, '').replace(/\.tsx$/, '')),
        );
      });
  }

  it('derives the person-lists from the pages rather than a maintained list', () => {
    // Measured 15 Sep 2026: 11.
    expect(personLists().length).toBeGreaterThanOrEqual(10);
  });

  it.each(personLists().map(({ file, source }) => [file, source] as const))(
    '%s sends a free-text search to the API',
    (file, source) => {
      const reason = UNSEARCHABLE[file];
      if (reason) {
        expect(reason.length, `${file} is exempt with an empty reason`).toBeGreaterThan(40);
        return;
      }
      /*
       * `q` REACHING THE API, by either shape this app uses: the URL-state
       * screens read `url.get('q')`, and `/approvals/ib` keeps the term in
       * local state and passes `q:` to the client. What is checked is the
       * parameter leaving the page, not how the box stores its text.
       */
      const request = withoutUrlWrites(source);
      const sendsQ = /\bq:\s/.test(request) || /\bset\('q'/.test(request);
      expect(
        sendsQ,
        `${file} lists people and offers no way to search for one. Either wire a q filter ` +
          `or add an entry to UNSEARCHABLE saying why this screen must not have one.`,
      ).toBe(true);
    },
  );

  it('exempts only screens that still exist', () => {
    // A stale exemption is worse than none: it silently excuses whatever file
    // takes that path next.
    for (const file of Object.keys(UNSEARCHABLE)) {
      expect(pages(), `${file} is exempt and is not a page any more`).toContain(file);
    }
  });
});

describe('GUARD 3 — no filter asks for an identifier the screen never shows', () => {
  /**
   * Every search control in the app, with the URL parameter it filters on.
   *
   * TWO shapes, and both must be counted or the floor below stops meaning
   * anything: a raw `<input type="search">`, and `<UrlSearchInput>` — the
   * component the five money screens moved to when a raw input bound to the URL
   * turned out to eat keystrokes. Counting only raw inputs made this floor drop
   * from 7 to 3 the moment that fix landed, which is the census correctly
   * refusing to be quietly narrowed.
   */
  function searchBoxes() {
    const boxes: { file: string; param: string | null; raw: boolean }[] = [];
    for (const file of sources()) {
      const source = strip(readFileSync(file, 'utf8'));

      const inputs = /<input[\s\S]{0,800}?\/>/g;
      let match: RegExpExecArray | null;
      while ((match = inputs.exec(source))) {
        if (!/type="search"/.test(match[0])) continue;
        const bound = /value=\{url\.get\('([^']+)'\)\}/.exec(match[0]);
        boxes.push({ file, param: bound?.[1] ?? null, raw: true });
      }

      const components = /<UrlSearchInput[\s\S]{0,800}?\/>/g;
      while ((match = components.exec(source))) {
        const bound = /value=\{url\.get\('([^']+)'\)\}/.exec(match[0]);
        boxes.push({ file, param: bound?.[1] ?? null, raw: false });
      }
    }
    return boxes;
  }

  it('finds the search boxes rather than assuming there are none', () => {
    // Measured 15 Sep 2026: 7 — the five money/audit screens (now
    // `<UrlSearchInput>`), the client filter bar, and the layout's command
    // search. The floor is what stops the two cases below passing vacuously
    // against a derivation that has quietly stopped matching anything.
    expect(searchBoxes().length).toBeGreaterThanOrEqual(6);
  });

  it('binds no search box to a uuid parameter', () => {
    /*
     * THE REPORTED BUG, as a rule. `/wallets` and `/trading-accounts` both bound
     * their box to `userId`. The deep-link parameters survive — a client profile
     * still links here with a uuid, and `url.get('userId')` still narrows the
     * list — but nothing may ask a PERSON to produce one.
     */
    for (const box of searchBoxes()) {
      if (!box.param) continue;
      expect(
        PERSON_ID.test(box.param),
        `${box.file} asks an operator to type ${box.param}, which is a uuid the screen ` +
          `does not display. Bind the box to a name/email search instead.`,
      ).toBe(false);
    }
  });

  it('no search box is controlled DIRECTLY by the URL', () => {
    /*
     * THE BUG THE OWNER REPORTED AS "I cannot type normally in the search
     * input", twice, on two different sets of screens.
     *
     * A raw `<input type="search" value={url.get('q')} onChange={url.set…}>` is
     * a controlled input whose value arrives through `router.replace`, which is
     * ASYNCHRONOUS. Between the keypress and the re-render the input still holds
     * the PREVIOUS value; React re-applies it, and the character is gone. Typing
     * at any speed loses letters, the caret jumps, and the term that reaches the
     * API is a subset of what was typed.
     *
     * `/clients` hit this, diagnosed it, and fixed it inside its own private
     * component — and five more boxes were then written from the broken pattern.
     * A fix that lives in one screen is one the next screen copies around, so
     * the fix is now `components/url-search-input.tsx` and this refuses the
     * pattern it replaces.
     *
     * Local state is still allowed: what is banned is the URL being in the
     * keystroke path.
     */
    for (const box of searchBoxes().filter((b) => b.raw)) {
      if (box.file.endsWith('url-search-input.tsx')) continue;
      expect(
        box.param,
        `${box.file} controls a raw <input type="search"> from the URL, so typing in it ` +
          'drops characters. Use <UrlSearchInput>, which keeps local state and writes the ' +
          'URL on a debounce.',
      ).toBeNull();
    }
  });

  it('tells nobody to paste an id', () => {
    /*
     * The copy, not the wiring — this is the exact sentence the owner
     * screenshotted. A box correctly bound to `q` whose placeholder still reads
     * "Paste a client ID" is the same defect to the person reading it.
     */
    const messages = readFileSync('src/lib/i18n/messages.ts', 'utf8');
    const offenders = messages
      .split('\n')
      .filter((line) => /paste[^']{0,30}\bid\b/i.test(line) || /\bpaste a client\b/i.test(line));
    expect(offenders, `filter copy still asks for an id:\n${offenders.join('\n')}`).toEqual([]);
  });
});
