import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaskedFieldsNotice, MaskedValue } from './masked-value';

/**
 * The three renders must stay UNLIKE EACH OTHER.
 *
 * That is the whole assertion set. The failure this guards against is not a
 * crash — it is a tidy-up that makes "masked" and "empty" look the same,
 * because both are "no value on screen" and one em dash is simpler than two
 * branches. After that, a compliance reviewer reading a blank phone cell
 * concludes the client never gave one.
 */

const row = (over: Record<string, unknown> = {}) => ({
  id: 'c-1',
  phone: '+961 1 000 000',
  country: 'Lebanon',
  maskedFields: [] as string[],
  ...over,
});

describe('a visible value', () => {
  it('renders the value', () => {
    render(<MaskedValue field="client.phone" row={row()} />);
    expect(screen.getByText('+961 1 000 000')).toBeInTheDocument();
  });

  it('renders formatted children instead, when given', () => {
    render(
      <MaskedValue field="client.phone" row={row()}>
        <strong>formatted</strong>
      </MaskedValue>,
    );
    expect(screen.getByText('formatted')).toBeInTheDocument();
  });
});

describe('an empty value', () => {
  it('renders an em dash — "this client has none"', () => {
    render(<MaskedValue field="client.phone" row={row({ phone: null })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('a masked value', () => {
  const masked = () => row({ phone: undefined, maskedFields: ['client.phone'] });

  it('does NOT render an em dash', () => {
    // The single most important assertion in this file. If this ever passes
    // while showing "—", the two states have been collapsed and the screen has
    // started making claims about clients that are really claims about the
    // viewer.
    render(<MaskedValue field="client.phone" row={masked()} />);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('does not render the value, even if it somehow arrived', () => {
    render(
      <MaskedValue
        field="client.phone"
        row={row({ phone: '+961 1 000 000', maskedFields: ['client.phone'] })}
      />,
    );
    expect(screen.queryByText('+961 1 000 000')).not.toBeInTheDocument();
  });

  it('has an accessible explanation, not just bullets', () => {
    /*
     * A screen-reader user hearing "bullet bullet bullet bullet" learns
     * nothing, and this is exactly the case where the REASON matters more than
     * the value. The glyph is aria-hidden and the sentence is sr-only.
     */
    render(<MaskedValue field="client.phone" row={masked()} />);
    expect(screen.getByText(/hidden by your permissions/i)).toBeInTheDocument();
  });
});

describe('the columns-hidden notice', () => {
  it('names what is hidden', () => {
    render(<MaskedFieldsNotice labels={['Phone number', 'Email address']} />);
    expect(screen.getByRole('note')).toHaveTextContent('Phone number, Email address');
  });

  it('renders nothing when nothing is hidden', () => {
    // An empty banner is a permanent strip of chrome saying "everything is
    // fine", which trains people to stop reading it.
    const { container } = render(<MaskedFieldsNotice labels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
