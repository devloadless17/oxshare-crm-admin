import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyableId } from './copyable-id';
import { t } from '@/lib/i18n';

/**
 * The contract worth pinning: what the CELL shows is 8 characters, but what
 * the CLIPBOARD gets is the whole uuid. Truncating the copied value would make
 * every pasted-into-support ID silently useless — the exact failure the copy
 * button exists to prevent.
 */

const UUID = '0b7d3c9e-4f21-48a6-9c05-2d8e11aa3f47';

describe('CopyableId', () => {
  it('shows the first 8 characters, with the full uuid as the title', () => {
    render(<CopyableId value={UUID} />);
    expect(screen.getByText('0b7d3c9e')).toBeInTheDocument();
    expect(screen.getByTitle(UUID)).toBeInTheDocument();
    expect(screen.queryByText(UUID)).not.toBeInTheDocument();
  });

  it('shows the whole uuid when full is set', () => {
    render(<CopyableId value={UUID} full />);
    expect(screen.getByText(UUID)).toBeInTheDocument();
  });

  it('copies the FULL uuid, never the truncated display', async () => {
    // userEvent installs its own clipboard stub over anything a test defines,
    // so the assertion reads the stub back rather than spying on writeText.
    const user = userEvent.setup();
    render(<CopyableId value={UUID} />);
    await user.click(screen.getByRole('button', { name: t('common.copyId') }));
    expect(await navigator.clipboard.readText()).toBe(UUID);
  });

  it('does not let the copy click bubble to a row-level handler', async () => {
    const rowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={rowClick}>
        <CopyableId value={UUID} />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: t('common.copyId') }));
    expect(rowClick).not.toHaveBeenCalled();
  });
});
