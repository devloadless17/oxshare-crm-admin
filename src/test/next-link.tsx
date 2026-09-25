import type { AnchorHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  children?: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
  onNavigate?: (event: { preventDefault: () => void }) => void;
};

/**
 * `next/link` as its CLICK CONTRACT, for tests that assert what a click does.
 *
 * The real component reaches `onNavigate` only through a mounted app router,
 * and jsdom has none: it calls `onClick` and stops, so a test cannot tell
 * "clicked" from "navigated". This stand-in keeps the order `app-dir/link.js`
 * (`linkClicked`) follows — `onClick` first; then, for a plain primary click
 * nothing prevented, `onNavigate` — and leaves a modified click (a new tab, a
 * new window) to the browser, as the real one does. The navigation itself is
 * the test's: it re-renders with the new pathname when it wants the page to
 * land.
 *
 *     vi.mock('next/link', () => import('@/test/next-link'));
 */
export default function Link({ href, onClick, onNavigate, children, ...rest }: LinkProps) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    event.preventDefault();
    onNavigate?.({ preventDefault: () => {} });
  };
  return (
    <a href={href} {...rest} onClick={click}>
      {children}
    </a>
  );
}
