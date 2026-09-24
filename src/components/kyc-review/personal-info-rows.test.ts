import { describe, expect, it } from 'vitest';
import {
  humanise,
  personalInfoGroups,
  rejectedFieldLabels,
  type InfoGroup,
  type InfoRow,
} from './personal-info-rows';
import type { components } from '@/lib/api/types.gen';

type KycStepConfig = components['schemas']['KycStepConfigDto'];
type KycField = KycStepConfig['fields'][number];

/** Narrowing helpers — indexing is checked, and a missing group is a failure. */
function groupNamed(groups: InfoGroup[], title: string): InfoGroup {
  const found = groups.find((g) => g.title === title);
  if (!found) {
    throw new Error(`no group titled "${title}" in [${groups.map((g) => g.title).join(', ')}]`);
  }
  return found;
}

function onlyRow(groups: InfoGroup[]): InfoRow {
  const [row, ...rest] = groups.flatMap((g) => g.rows);
  if (!row || rest.length > 0) throw new Error(`expected exactly one row, got ${rest.length + 1}`);
  return row;
}

/**
 * What the reviewer reads on the KYC screen.
 *
 * Every case here is something the old rendering got wrong on a real
 * submission: it prettified the KEY with a camelCase regex and printed the
 * stored string, so a builder-created `id_number` reached a compliance decision
 * as `id_number`, and a date of birth as a UTC timestamp.
 */

function step(partial: Partial<KycStepConfig> & { title: string }): KycStepConfig {
  return {
    id: `step-${partial.title}`,
    stepNumber: 1,
    slug: 'personal',
    enabled: true,
    fields: [],
    ...partial,
  };
}

function field(name: string, label: string, type: KycField['type'] = 'text'): KycField {
  return { id: `f-${name}`, name, label, type, required: false };
}

const PERSONAL = step({
  title: 'Personal Information',
  slug: 'personal',
  fields: [
    field('firstName', 'First Name'),
    field('lastName', 'Last Name'),
    field('dateOfBirth', 'Date of Birth', 'date'),
  ],
});

describe('labels come from the configuration the client filled in', () => {
  it('uses the configured label, not a prettified key', () => {
    const row = onlyRow(personalInfoGroups({ firstName: 'Hussein' }, [PERSONAL]));

    expect(row.label).toBe('First Name');
    // The KEY is still what travels to the reject endpoint.
    expect(row.key).toBe('firstName');
  });

  it('follows the configured ORDER, not the order the JSON happened to hold', () => {
    // Submitted back to front. Two submissions must not lay out differently.
    const groups = personalInfoGroups(
      { dateOfBirth: '1994-03-07', lastName: 'Hazime', firstName: 'Hussein' },
      [PERSONAL],
    );

    expect(groupNamed(groups, 'Personal Information').rows.map((r) => r.key)).toEqual([
      'firstName',
      'lastName',
      'dateOfBirth',
    ]);
  });

  it('groups by step, so the card matches the wizard', () => {
    const address = step({
      title: 'Address',
      slug: 'address',
      fields: [field('city', 'City')],
    });

    const groups = personalInfoGroups({ firstName: 'Hussein', city: 'Beirut' }, [
      PERSONAL,
      address,
    ]);

    expect(groups.map((g) => g.title)).toEqual(['Personal Information', 'Address']);
  });

  it('skips disabled steps and the review step, which hold no answers', () => {
    const groups = personalInfoGroups({ firstName: 'Hussein', agreed: 'true' }, [
      PERSONAL,
      step({ title: 'Review', slug: 'review', fields: [field('agreed', 'Agreed')] }),
    ]);

    expect(groups.map((g) => g.title)).toEqual(['Personal Information', 'Other Details']);
  });
});

describe('values are readable without being altered', () => {
  it('renders a date as a date, not as the stored timestamp', () => {
    const row = onlyRow(
      personalInfoGroups({ dateOfBirth: '1994-03-07T00:00:00.000Z' }, [PERSONAL]),
    );

    expect(row.value).not.toContain('T00:00:00');
    expect(row.value).toBe(new Date('1994-03-07T00:00:00.000Z').toLocaleDateString());
  });

  it('leaves an unparseable date exactly as submitted', () => {
    // A reviewer comparing against a passport must see what was actually sent,
    // and "Invalid Date" tells them nothing about the value.
    const row = onlyRow(personalInfoGroups({ dateOfBirth: 'not a date' }, [PERSONAL]));

    expect(row.value).toBe('not a date');
  });

  it('renders a checkbox as Yes or No', () => {
    const consent = step({
      title: 'Consent',
      slug: 'consent',
      fields: [field('pep', 'Politically Exposed', 'checkbox')],
    });

    expect(onlyRow(personalInfoGroups({ pep: 'true' }, [consent])).value).toBe('Yes');
    expect(onlyRow(personalInfoGroups({ pep: 'false' }, [consent])).value).toBe('No');
  });

  it('marks a blank value as empty rather than leaving a gap', () => {
    expect(onlyRow(personalInfoGroups({ firstName: '   ' }, [PERSONAL]))).toMatchObject({
      value: '—',
      empty: true,
    });
  });

  it('passes anything it cannot improve through untouched', () => {
    const row = onlyRow(personalInfoGroups({ firstName: 'de la Cruz-O’Brien' }, [PERSONAL]));

    expect(row.value).toBe('de la Cruz-O’Brien');
  });
});

describe('nothing submitted is ever dropped', () => {
  it('still shows a key the configuration does not describe', () => {
    // A field renamed or removed in the builder after this client submitted.
    const groups = personalInfoGroups({ firstName: 'Hussein', legacy_tax_id: 'X-1' }, [PERSONAL]);

    expect(groupNamed(groups, 'Other Details').rows).toEqual([
      { key: 'legacy_tax_id', label: 'Legacy Tax Id', value: 'X-1', empty: false },
    ]);
  });

  it('renders everything under one heading when there is no configuration at all', () => {
    // The config endpoint being down must not hide identity data.
    const groups = personalInfoGroups({ firstName: 'Hussein' }, []);

    expect(groups).toHaveLength(1);
    expect(groupNamed(groups, 'Personal Information').rows[0]?.label).toBe('First Name');
  });

  it('leaves docType out — it has its own card, and twice reads as a duplicate', () => {
    const groups = personalInfoGroups({ docType: 'passport', firstName: 'Hussein' }, [PERSONAL]);

    expect(groups.flatMap((g) => g.rows).map((r) => r.key)).toEqual(['firstName']);
  });

  it('returns nothing at all when the client submitted nothing', () => {
    expect(personalInfoGroups(undefined, [PERSONAL])).toEqual([]);
  });
});

describe('humanise — the fallback for an unconfigured key', () => {
  it('handles the three shapes the builder can produce', () => {
    // The old regex handled only the first; the other two reached the screen
    // exactly as stored.
    expect(humanise('firstName')).toBe('First Name');
    expect(humanise('id_number')).toBe('Id Number');
    expect(humanise('tax-id')).toBe('Tax Id');
  });
});

describe("a custom step's answers", () => {
  /*
   * A custom step stores under its own slug in `stepData` (backend migration
   * 0130). Before this, those answers were collected, submitted and INVISIBLE —
   * a worse state than not collecting them, because the client answers a
   * compliance question and the reviewer decides without ever seeing it.
   */
  const COMPLIANCE = step({
    title: 'Compliance Questions',
    slug: 'compliance-questions',
    fields: [
      { id: 'f1', name: 'sourceOfFunds', label: 'Source of Funds', type: 'text', required: true },
    ],
  });

  it('renders under the step that asked for them', () => {
    const groups = personalInfoGroups({ firstName: 'Hussein' }, [COMPLIANCE], {
      'compliance-questions': { sourceOfFunds: 'Salary' },
    });

    const row = groupNamed(groups, 'Compliance Questions').rows[0];
    expect(row?.label).toBe('Source of Funds');
    expect(row?.value).toBe('Salary');
  });

  /** Two custom steps may legitimately use the same key — separate maps. */
  it('keeps the same key in two steps as two answers', () => {
    const other = step({
      title: 'Other',
      slug: 'other',
      fields: [{ id: 'f2', name: 'note', label: 'Note', type: 'text', required: false }],
    });
    const compliance = step({
      title: 'Compliance Questions',
      slug: 'compliance-questions',
      fields: [{ id: 'f3', name: 'note', label: 'Note', type: 'text', required: false }],
    });

    const groups = personalInfoGroups({}, [compliance, other], {
      'compliance-questions': { note: 'from compliance' },
      other: { note: 'from other' },
    });

    expect(groupNamed(groups, 'Compliance Questions').rows[0]?.value).toBe('from compliance');
    expect(groupNamed(groups, 'Other').rows[0]?.value).toBe('from other');
  });

  /** Nothing submitted is ever dropped — the same rule the personal block has. */
  it('still shows an answer whose field was removed from the step', () => {
    const groups = personalInfoGroups({}, [COMPLIANCE], {
      'compliance-questions': { sourceOfFunds: 'Salary', retiredQuestion: 'kept' },
    });

    const values = groupNamed(groups, 'Compliance Questions').rows.map((r) => r.value);
    expect(values).toContain('kept');
  });

  /** A submission with no personal info can still carry custom answers. */
  it('renders them even when there is no personal info at all', () => {
    const groups = personalInfoGroups(undefined, [COMPLIANCE], {
      'compliance-questions': { sourceOfFunds: 'Salary' },
    });
    expect(groupNamed(groups, 'Compliance Questions').rows).toHaveLength(1);
  });

  it('adds nothing when the step has no answers', () => {
    const groups = personalInfoGroups({ firstName: 'Hussein' }, [COMPLIANCE], {});
    expect(groups.find((g) => g.title === 'Compliance Questions')).toBeUndefined();
  });
});

describe('what the portal once wrote into personalInfo that is not an answer', () => {
  /*
   * Reported from production, with a screenshot: "OTHER DETAILS — Doc Choice
   * Address, Doc Choice Document, Custom Field 1790263641710, Custom Field
   * 1790263652846: [object Object]". The portal's review screen re-posted the
   * whole wizard form as the personal step, so UI state, stringified uploads and
   * copies of custom answers were read as the client's details.
   */
  const SOURCE = step({
    title: 'Source of Funds',
    slug: 'source-of-funds',
    fields: [
      field('customField_1790263641710', 'Employer'),
      field('customField_1790263652846', 'Payslip', 'file'),
    ],
  });

  const polluted = {
    firstName: 'Hussein',
    __docChoice__address: 'utilityBill',
    __docChoice__document: 'passport',
    customField_1790263641710: 'Acme Ltd',
    customField_1790263652846: '[object Object]',
  };
  const stepData = {
    'source-of-funds': {
      customField_1790263641710: 'Acme Ltd',
      customField_1790263652846: { filePath: 'uploads/kyc/pay.jpg', fileName: 'pay.jpg' },
    },
  };

  it('shows each answer ONCE, under its own step, by the label the broker gave it', () => {
    const groups = personalInfoGroups(polluted, [PERSONAL, SOURCE], stepData);

    expect(groups.map((g) => g.title)).toEqual(['Personal Information', 'Source of Funds']);
    expect(groupNamed(groups, 'Source of Funds').rows.map((r) => r.label)).toEqual([
      'Employer',
      'Payslip',
    ]);
    const all = JSON.stringify(groups);
    expect(all).not.toMatch(/docChoice|Doc Choice|Custom Field|\[object Object\]/i);
  });

  it('names an uploaded answer and links it, never printing its stored record', () => {
    const groups = personalInfoGroups(polluted, [PERSONAL, SOURCE], stepData);
    const payslip = groupNamed(groups, 'Source of Funds').rows[1];

    expect(payslip).toMatchObject({
      label: 'Payslip',
      value: 'pay.jpg',
      file: { filePath: 'uploads/kyc/pay.jpg', fileName: 'pay.jpg' },
    });
    expect(payslip?.value).not.toContain('filePath');
  });

  it('labels a question removed from the form in words, not by its key', () => {
    const groups = personalInfoGroups({ firstName: 'Hussein', customField_1790263641710: 'Acme' }, [
      PERSONAL,
    ]);

    expect(groupNamed(groups, 'Other Details').rows[0]?.label).toBe(
      'Question no longer on the form',
    );
  });

  it('keeps the label of a field whose step was since disabled', () => {
    const groups = personalInfoGroups({ firstName: 'Hussein', customField_1790263641710: 'Acme' }, [
      PERSONAL,
      { ...SOURCE, enabled: false },
    ]);

    expect(groupNamed(groups, 'Other Details').rows[0]?.label).toBe('Employer');
  });
});

describe('rejectedFieldLabels — the flagged-fields chips', () => {
  it('names each flag the way the client read it', () => {
    const SOURCE = step({
      title: 'Source of Funds',
      slug: 'source-of-funds',
      fields: [field('customField_1790263652846', 'Payslip', 'file')],
    });

    expect(
      rejectedFieldLabels(
        ['dateOfBirth', 'doc_back', 'customField_1790263652846', 'customField_1'],
        [PERSONAL, SOURCE],
      ),
    ).toEqual(['Date of Birth', 'ID document (back)', 'Payslip', 'Question no longer on the form']);
  });
});
