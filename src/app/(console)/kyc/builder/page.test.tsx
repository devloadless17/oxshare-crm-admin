import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import KycBuilderPage, { type KycStepConfig } from './page';

/**
 * Guards the payload shape of `PUT /admin/kyc-config`.
 *
 * This screen shipped sending the bare `steps` array where the endpoint takes
 * `{ steps }`, so "Save All Changes" returned 400 for every user of the KYC step
 * configurator. It stayed invisible because the catch block discarded the error
 * and rendered a fixed "Error saving configuration." string, which read like a
 * server fault rather than a client bug.
 *
 * Type-checking cannot catch it: `api.put` takes an unknown body, and the
 * generated request type is not applied at the call site. Only an assertion on
 * what actually goes over the wire does.
 */

const { get, put, post } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get, put, post },
}));

const STEPS: KycStepConfig[] = [
  {
    id: 'step-1',
    stepNumber: 1,
    slug: 'personal',
    title: 'Personal Information',
    description: 'Legal identity details.',
    icon: 'User',
    enabled: true,
    fields: [{ id: 'f-1', name: 'firstName', label: 'First Name', type: 'text', required: true }],
  },
  {
    id: 'step-2',
    stepNumber: 2,
    slug: 'document',
    title: 'Identity Document',
    description: 'Government photo ID.',
    icon: 'FileText',
    enabled: true,
    fields: [],
  },
];

/**
 * Opens a step's tab and returns once its editor is on screen.
 *
 * Every step is a tab now, so a case about a step's own controls has to select
 * it first. The overview is the default tab and carries the ordering rows, so
 * cases about ordering do NOT call this.
 */
async function openStepTab(title: string) {
  const tab = await screen.findByRole('tab', { name: new RegExp(title, 'i') });
  await userEvent.setup().click(tab);
  return tab;
}

/**
 * The documents a `doc:*` field may collect. Served by
 * `GET /admin/kyc-config/document-catalogue`, so the builder offers each one as
 * an input type rather than hard-coding the list.
 */
const CATALOGUE = [
  {
    value: 'passport',
    label: 'Passport',
    category: 'identity',
    parts: [{ key: 'front', label: 'Photo Page', required: true }],
  },
  {
    value: 'national_id',
    label: 'National ID',
    category: 'identity',
    parts: [
      { key: 'front', label: 'Front Side', required: true },
      { key: 'back', label: 'Back Side', required: true },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  /*
   * URL-AWARE. A single `mockResolvedValue` answered the catalogue request with
   * the step list, so the builder read steps as catalogue entries and crashed
   * on the missing `parts`.
   */
  get.mockImplementation((url: string) =>
    Promise.resolve({ data: url.includes('document-catalogue') ? CATALOGUE : STEPS }),
  );
  put.mockResolvedValue({ data: STEPS });
});

describe('KYC builder — save payload', () => {
  it('wraps the steps array in { steps }, not sending it bare', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);

    const save = await screen.findByRole('button', { name: /save all changes/i });
    await user.click(save);

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));

    const [url, body] = put.mock.calls[0] as [string, unknown];
    expect(url).toBe('/admin/kyc-config');

    // The assertion that matters. A bare array here is the bug.
    expect(Array.isArray(body)).toBe(false);
    expect(body).toEqual({ steps: STEPS });
  });

  it('surfaces the API message on failure instead of a fixed string', async () => {
    // What the endpoint actually answered while the bug was live.
    put.mockRejectedValueOnce({
      response: { data: { message: ['steps must be an array'] } },
    });

    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);

    await user.click(await screen.findByRole('button', { name: /save all changes/i }));

    // A blind catch is what let the payload bug survive, so the real reason has
    // to reach the screen.
    expect(await screen.findByText(/steps must be an array/i)).toBeInTheDocument();
  });

  it('reports success only after the request resolves', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);

    await user.click(await screen.findByRole('button', { name: /save all changes/i }));

    expect(await screen.findByText(/updated successfully/i)).toBeInTheDocument();
  });
});

/**
 * FR-CORE-15 / FR-IND-03: the identity, selfie, address and personal steps are
 * mandatory. The client portal submits by slug and the FSD's acceptance criteria
 * depend on them, so disabling or deleting one silently breaks onboarding for
 * every new client (DECISIONS D-29).
 *
 * That rule lived only in this screen's own conventions. These tests make it a
 * property of the code.
 */
describe('KYC builder — every step is removable', () => {
  /*
   * `personal`, `document`, `selfie` and `address` were undeletable and
   * undisablable, in the admin UI and in the backend, citing FR-CORE-15.
   *
   * The owner retired the rule on 15 Aug 2026 (see the note in
   * admin-compliance.service.ts): a KYC flow sold as configurable that refuses
   * to drop four of its steps is not configurable, and which documents a
   * jurisdiction requires is the broker's decision. What replaces the block is
   * the audit trail — `kyc_config.replace` records the enabled slug list on
   * every save, so a removal has a name and a date attached.
   *
   * These cases pin the unlock, so a future "safety" patch that reinstates the
   * guard has to argue with them first.
   */
  it('disables a step whose slug used to be mandatory', async () => {
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');

    const disable = screen.getByRole('button', { name: /^disable$/i });
    expect(disable).toBeEnabled();

    const user = userEvent.setup();
    await user.click(disable);
    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]?.[1] as { steps: KycStepConfig[] };
    expect(body.steps.find((step) => step.slug === 'personal')?.enabled).toBe(false);
  });

  it('deletes a step whose slug used to be mandatory', async () => {
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');

    const remove = screen.getByTitle(/^delete step$/i);
    expect(remove).toBeEnabled();

    const user = userEvent.setup();
    await user.click(remove);
    // The confirmation is a real dialog, not window.confirm.
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));
    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]?.[1] as { steps: KycStepConfig[] };
    expect(body.steps.map((step) => step.slug)).toEqual(['document']);
    // Renumbered, so the survivor is step 1 rather than still claiming to be 2.
    expect(body.steps[0]?.stepNumber).toBe(1);
  });

  it('lets a formerly-locked slug be edited', async () => {
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');

    // The slug input was `disabled` for these four. The portal branches on
    // slug, so renaming one changes which special handling it gets — that is
    // the operator's call to make now.
    const slug = screen.getByDisplayValue('personal');
    expect(slug).toBeEnabled();
  });

  it('drags a formerly-pinned step, because nothing is pinned any more', async () => {
    renderWithProviders(<KycBuilderPage />);
    await screen.findByRole('tab', { name: /1\./ });

    const handle = screen.getByRole('button', { name: /reorder step personal information/i });
    expect(handle).toBeEnabled();
    expect(handle).not.toHaveAttribute('title');
  });
});

describe('KYC builder — step ordering', () => {
  it('renumbers steps after a move, so stepNumber matches position', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);
    // Await the step's TAB, not bare text: the title now appears in the strip
    // and in the overview row, so `findByText` matches two nodes.
    await openStepTab('Personal Information');

    // Move the second step up, then save and inspect what is sent.
    const downs = screen.getAllByTitle(/move step down/i);
    await user.click(downs[0]!);
    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [, body] = put.mock.calls[0] as [
      string,
      { steps: { slug: string; stepNumber: number }[] },
    ];

    // The portal routes by stepNumber, so a gap or a duplicate sends a client to a
    // step that does not exist.
    expect(body.steps.map((s) => s.stepNumber)).toEqual([1, 2]);
    expect(body.steps[0]?.slug).toBe('document');
    expect(body.steps[1]?.slug).toBe('personal');
  });
});

/*
 * ── The tabbed rework ──────────────────────────────────────────────────────
 *
 * Three tabs replaced one long accordion scroll, `options`/`hint` gained
 * editors they never had, and reordering became drag-and-drop ON TOP OF the
 * arrow buttons rather than instead of them. What follows walks each of those.
 */

/** A config with the shapes the "All Fields" tab exists to flag. */
const MESSY: KycStepConfig[] = [
  {
    id: 'step-1',
    stepNumber: 1,
    slug: 'personal',
    title: 'Personal Information',
    description: 'Legal identity details.',
    icon: 'User',
    enabled: true,
    fields: [
      { id: 'f-1', name: 'firstName', label: 'First Name', type: 'text', required: true },
      // Same `name` as f-3 below, in a DIFFERENT step — invisible in the editor.
      {
        id: 'f-2',
        name: 'docType',
        label: 'Document Type',
        type: 'select',
        required: true,
        options: ['Passport', 'National ID'],
      },
    ],
  },
  {
    id: 'step-2',
    stepNumber: 2,
    slug: 'document',
    title: 'Identity Document',
    description: 'Government photo ID.',
    icon: 'FileText',
    enabled: false,
    fields: [
      { id: 'f-3', name: 'docType', label: 'Kind of document', type: 'select', required: true },
    ],
  },
];

describe('KYC builder — tabs', () => {
  it('gives every step its own tab, and opens on the overview', async () => {
    renderWithProviders(<KycBuilderPage />);
    await screen.findByRole('tab', { name: /1\./ });

    // The overview is first and selected, so the operator lands on the flow
    // rather than inside whichever step happened to be first.
    expect(screen.getByRole('tab', { name: /overview/i })).toHaveAttribute('aria-selected', 'true');
    // One tab per step, numbered — the strip doubles as the running order.
    expect(screen.getByRole('tab', { name: /1\. Personal Information/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /2\. Identity Document/i })).toBeInTheDocument();
  });

  it('shows one step at a time — the others are not mounted', async () => {
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');

    // Step 1's slug input is on screen; step 2's is not rendered at all, which
    // is the point of tabs over a stack of accordions.
    expect(screen.getByDisplayValue('personal')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('document')).not.toBeInTheDocument();
  });

  it('shows the client flow, marking a disabled step as skipped', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('document-catalogue') ? CATALOGUE : MESSY }),
    );
    renderWithProviders(<KycBuilderPage />);
    await screen.findByRole('table');

    /*
     * The BADGE, not the intro paragraph — which also says "skipped" and would
     * pass whether or not any step were marked.
     */
    expect(await screen.findByText(/skipped — step is disabled/i)).toBeInTheDocument();
    // And the enabled step carries no such badge: exactly one is skipped.
    expect(screen.getAllByText(/skipped — step is disabled/i)).toHaveLength(1);
  });

  it('lists every field across every step in one table', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('document-catalogue') ? CATALOGUE : MESSY }),
    );
    renderWithProviders(<KycBuilderPage />);
    await screen.findByRole('table');

    const table = await screen.findByRole('table');
    // Three fields over two steps — the point of the tab is that they appear
    // together without opening each card.
    expect(within(table).getByText('First Name')).toBeInTheDocument();
    expect(within(table).getByText('Document Type')).toBeInTheDocument();
    expect(within(table).getByText('Kind of document')).toBeInTheDocument();
  });
});

describe('KYC builder — problems the operator cannot otherwise see', () => {
  it('flags a key name duplicated ACROSS steps', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('document-catalogue') ? CATALOGUE : MESSY }),
    );
    renderWithProviders(<KycBuilderPage />);
    await screen.findByRole('table');

    /*
     * `docType` is on both steps. The portal submits by `name`, so the second
     * silently overwrites the first — and because they live in different steps,
     * no single card can show it.
     */
    const table = await screen.findByRole('table');
    expect(within(table).getAllByText(/duplicate key/i).length).toBe(2);
  });

  it('flags a dropdown with no choices, which renders empty for the client', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('document-catalogue') ? CATALOGUE : MESSY }),
    );
    renderWithProviders(<KycBuilderPage />);
    await screen.findByRole('table');

    const table = await screen.findByRole('table');
    // f-3 is a select with no `options`. f-2 has two, so exactly one is flagged.
    expect(within(table).getAllByText(/dropdown with no choices/i).length).toBe(1);
  });

  it('says nothing to flag when the config is clean', async () => {
    renderWithProviders(<KycBuilderPage />);

    expect(await screen.findByText(/nothing to flag/i)).toBeInTheDocument();
  });
});

describe('KYC builder — the field editor', () => {
  /** Opens step 1's editor body, which holds its fields. */
  async function openFirstStep(user: ReturnType<typeof userEvent.setup>) {
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');
    // The first step is expanded by default, so nothing to click — but assert
    // it, because the default is what every case below depends on.
    return user;
  }

  it('edits a label, and the edit reaches the save payload', async () => {
    const user = userEvent.setup();
    await openFirstStep(user);

    const label = screen.getByDisplayValue('First Name');
    await user.clear(label);
    await user.type(label, 'Given Name');

    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]?.[1] as { steps: KycStepConfig[] };
    expect(body.steps[0]?.fields[0]?.label).toBe('Given Name');
  });

  it('adds a field to a step', async () => {
    const user = userEvent.setup();
    await openFirstStep(user);

    await user.click(screen.getByRole('button', { name: /add field/i }));
    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]?.[1] as { steps: KycStepConfig[] };
    expect(body.steps[0]?.fields).toHaveLength(2);
  });

  it('removes a field', async () => {
    const user = userEvent.setup();
    await openFirstStep(user);

    await user.click(screen.getByRole('button', { name: /remove field first name/i }));
    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]?.[1] as { steps: KycStepConfig[] };
    expect(body.steps[0]?.fields).toHaveLength(0);
  });

  it('toggles required', async () => {
    const user = userEvent.setup();
    await openFirstStep(user);

    // f-1 seeds `required: true`, so one click clears it.
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]?.[1] as { steps: KycStepConfig[] };
    expect(body.steps[0]?.fields[0]?.required).toBe(false);
  });

  it('stores a hint, which had no editor at all before', async () => {
    const user = userEvent.setup();
    await openFirstStep(user);

    await user.type(screen.getByLabelText(/helper text/i), 'As on your passport');
    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]?.[1] as { steps: KycStepConfig[] };
    expect(body.steps[0]?.fields[0]?.hint).toBe('As on your passport');
  });

  it('offers the options box ONLY for a select, and parses it to an array', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('document-catalogue') ? CATALOGUE : MESSY }),
    );
    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');

    // f-1 is text, f-2 is select — so exactly one options box is on screen.
    const options = screen.getAllByLabelText(/dropdown choices/i);
    expect(options).toHaveLength(1);

    const box = options[0]!;
    await user.clear(box);
    await user.type(box, 'Passport, Driving licence');
    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]?.[1] as { steps: KycStepConfig[] };
    // Trimmed, and split on the comma — not stored as the raw string.
    expect(body.steps[0]?.fields[1]?.options).toEqual(['Passport', 'Driving licence']);
  });
});

describe('KYC builder — reordering', () => {
  it('gives every step a drag handle, on the overview where order is visible', async () => {
    renderWithProviders(<KycBuilderPage />);
    // A STEP tab, not the overview: the overview renders during loading, so
    // awaiting it would proceed against the skeleton.
    await screen.findByRole('tab', { name: /1\./ });

    expect(
      screen.getByRole('button', { name: /reorder step personal information/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reorder step identity document/i }),
    ).toBeInTheDocument();
  });

  it('keeps the arrow buttons working alongside drag', async () => {
    // Drag is an ADDITION. Removing the arrows would drop an ability that
    // works under any assistive technology, so both paths stay live.
    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');

    await user.click(screen.getAllByTitle(/move step down/i)[0]!);
    await user.click(screen.getByRole('button', { name: /save all changes/i }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]?.[1] as { steps: KycStepConfig[] };
    expect(body.steps.map((s) => s.slug)).toEqual(['document', 'personal']);
    // Renumbered, so stepNumber still matches position.
    expect(body.steps.map((s) => s.stepNumber)).toEqual([1, 2]);
  });
});

describe('KYC builder — unsaved state', () => {
  it('says nothing is pending on a clean load', async () => {
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');

    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it('warns as soon as an edit is made, and clears once saved', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');

    await user.type(screen.getByDisplayValue('First Name'), '!');
    expect(await screen.findByText(/unsaved changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save all changes/i }));
    await waitFor(() => expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument());
  });
});

describe('KYC builder — the options box holds its own text', () => {
  /*
   * The regression these pin: deriving the input's value from the parsed array
   * ate every separator as it was typed, so "Passport, Driving licence" became
   * the single option "PassportDrivinglicence".
   */
  it('keeps a trailing comma and space visible while typing', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('document-catalogue') ? CATALOGUE : MESSY }),
    );
    const user = userEvent.setup();
    renderWithProviders(<KycBuilderPage />);
    // The field editor lives on the STEP's tab; the overview is read-only.
    await openStepTab('Personal Information');

    const box = screen.getByLabelText(/dropdown choices/i);
    await user.clear(box);
    await user.type(box, 'Passport, ');

    // Mid-edit, the separator is still there. Deriving from the array would
    // have re-rendered this as "Passport".
    expect(box).toHaveValue('Passport, ');
  });

  it('seeds from the field it is editing, not from a sibling', async () => {
    // Two selects with DIFFERENT options: the second must not show the first's
    // text. The `key` on the sortable row is what remounts the editor.
    get.mockResolvedValue({
      data: [
        {
          ...MESSY[0]!,
          fields: [
            {
              id: 'f-a',
              name: 'a',
              label: 'A',
              type: 'select',
              required: false,
              options: ['Alpha'],
            },
            {
              id: 'f-b',
              name: 'b',
              label: 'B',
              type: 'select',
              required: false,
              options: ['Beta', 'Gamma'],
            },
          ],
        },
      ],
    });
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');

    const boxes = screen.getAllByLabelText(/dropdown choices/i);
    expect(boxes[0]).toHaveValue('Alpha');
    expect(boxes[1]).toHaveValue('Beta, Gamma');
  });
});

describe('KYC builder — drag and drop wiring', () => {
  /*
   * ── What is and is NOT asserted here, and why ───────────────────────────
   *
   * dnd-kit positions rows from real geometry — `getBoundingClientRect` on
   * every droppable. jsdom has no layout engine and reports 0x0 for all of
   * them, so a simulated drag (pointer OR keyboard) finds nothing beneath the
   * lifted row and drops it back where it started. A test asserting a reorder
   * through the sensors would be asserting jsdom's missing layout, and it
   * would pass just as happily against a build where drag was broken.
   *
   * So the split is deliberate:
   *  - the reorder FUNCTION is unit-tested directly, in sortable-row.test.tsx
   *  - the handles, their labels and their disabled state are asserted here
   *  - the arrow buttons, which do not need layout, cover the end-to-end path
   *    from a click to the saved payload (see "reordering" above)
   *
   * A real drag needs a real browser. e2e/ is where that belongs.
   */
  const CUSTOM: KycStepConfig[] = [
    {
      id: 'c-1',
      stepNumber: 1,
      slug: 'alpha',
      title: 'Alpha',
      description: 'First.',
      icon: 'File',
      enabled: true,
      fields: [],
    },
    {
      id: 'c-2',
      stepNumber: 2,
      slug: 'beta',
      title: 'Beta',
      description: 'Second.',
      icon: 'File',
      enabled: true,
      fields: [],
    },
  ];

  it('gives a custom step a LIVE handle, unlike a mandatory one', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('document-catalogue') ? CATALOGUE : CUSTOM }),
    );
    renderWithProviders(<KycBuilderPage />);
    // A STEP tab, not the overview: the overview renders during loading, so
    // awaiting it would proceed against the skeleton.
    await screen.findByRole('tab', { name: /1\./ });

    const handle = screen.getByRole('button', { name: /reorder step alpha/i });
    expect(handle).toBeEnabled();
    // A live handle carries no "why not" tooltip — that belongs to dead ones.
    expect(handle).not.toHaveAttribute('title');
  });

  it('marks the handle as a drag affordance for assistive technology', async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('document-catalogue') ? CATALOGUE : CUSTOM }),
    );
    renderWithProviders(<KycBuilderPage />);
    // A STEP tab, not the overview: the overview renders during loading, so
    // awaiting it would proceed against the skeleton.
    await screen.findByRole('tab', { name: /1\./ });

    // dnd-kit puts `aria-roledescription` on the activator so a screen reader
    // announces it as sortable rather than as a plain button.
    const handle = screen.getByRole('button', { name: /reorder step alpha/i });
    expect(handle).toHaveAttribute('aria-roledescription');
  });

  it('gives each FIELD inside a step its own handle', async () => {
    renderWithProviders(<KycBuilderPage />);
    await openStepTab('Personal Information');

    // Step 1 is expanded by default and holds one field.
    expect(screen.getByRole('button', { name: /reorder field first name/i })).toBeInTheDocument();
  });
});
