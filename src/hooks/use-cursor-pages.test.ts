import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCursorPages } from './use-cursor-pages';

/**
 * PLATFORM-CONVENTIONS R-2.4.
 *
 * The API moved to keyset pagination because offset paging over a list being
 * WRITTEN TO skips rows — silently, on a client base under compliance review.
 * The visible cost is that "jump to page 7" is gone: a cursor names a row, not
 * an ordinal.
 *
 * Going BACK needs no API support, and that is what this hook is: the cursor
 * that opened each page is kept on a stack, so "previous" is a pop.
 */
describe('R-2.4 cursor navigation', () => {
  it('starts on the first page with no cursor and no way back', () => {
    const { result } = renderHook(() => useCursorPages());

    expect(result.current.cursor).toBeUndefined();
    expect(result.current.pageNumber).toBe(1);
    expect(result.current.canGoBack).toBe(false);
  });

  it('walks forward, carrying the cursor the server returned', () => {
    const { result } = renderHook(() => useCursorPages());

    act(() => result.current.goNext('cursor-page-2'));
    expect(result.current.cursor).toBe('cursor-page-2');
    expect(result.current.pageNumber).toBe(2);
    expect(result.current.canGoBack).toBe(true);

    act(() => result.current.goNext('cursor-page-3'));
    expect(result.current.cursor).toBe('cursor-page-3');
    expect(result.current.pageNumber).toBe(3);
  });

  it('goes back by popping, returning to the exact page it came from', () => {
    // The whole reason the stack exists: a cursor only points forward, so
    // "previous" has to be remembered rather than computed.
    const { result } = renderHook(() => useCursorPages());

    act(() => result.current.goNext('cursor-page-2'));
    act(() => result.current.goNext('cursor-page-3'));
    act(() => result.current.goBack());

    expect(result.current.cursor).toBe('cursor-page-2');
    expect(result.current.pageNumber).toBe(2);

    act(() => result.current.goBack());
    expect(result.current.cursor).toBeUndefined();
    expect(result.current.pageNumber).toBe(1);
    expect(result.current.canGoBack).toBe(false);
  });

  it('ignores a null cursor rather than advancing to an empty page', () => {
    // `null` is how the server says "this is the last page". Advancing anyway
    // would show an empty table and make the user press Previous to recover
    // from a button that should not have been enabled.
    const { result } = renderHook(() => useCursorPages());

    act(() => result.current.goNext('cursor-page-2'));
    act(() => result.current.goNext(null));

    expect(result.current.pageNumber).toBe(2);
    expect(result.current.cursor).toBe('cursor-page-2');
  });

  it('resets to the first page, which is what a filter change must do', () => {
    // Keeping a cursor across a filter change would ask the server for
    // "everything after row X" in a result set row X may not even be in.
    const { result } = renderHook(() => useCursorPages());

    act(() => result.current.goNext('cursor-page-2'));
    act(() => result.current.goNext('cursor-page-3'));
    act(() => result.current.reset());

    expect(result.current.cursor).toBeUndefined();
    expect(result.current.pageNumber).toBe(1);
    expect(result.current.canGoBack).toBe(false);
  });

  it('does not go back past the first page', () => {
    const { result } = renderHook(() => useCursorPages());

    act(() => result.current.goBack());
    act(() => result.current.goBack());

    expect(result.current.pageNumber).toBe(1);
    expect(result.current.cursor).toBeUndefined();
  });
});
