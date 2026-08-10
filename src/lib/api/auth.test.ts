import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The multipart header, which is the whole of what this file pins.
 *
 * `apiClient` sets `'Content-Type': 'application/json'` as an instance default.
 * Axios only generates the `boundary` token a multipart body is unparseable
 * without when that header is UNSET — so with the default in place it posted a
 * `FormData` body labelled as JSON, multer found no multipart request, and the
 * API answered `400 VALIDATION_FAILED: No file was uploaded.`
 *
 * That error names the file, so it reads as "the file did not reach the
 * server" and sends you to the file input, the accept list, and the size check
 * — none of which are involved. It shipped and was found by uploading a photo.
 *
 * A one-line regression is worth it because the fix is a single argument that
 * looks removable: `{ headers: { 'Content-Type': undefined } }` reads like a
 * no-op to anyone tidying, and deleting it restores the bug in a form no
 * typecheck or lint can see.
 */

const { post, del } = vi.hoisted(() => ({ post: vi.fn(), del: vi.fn() }));

vi.mock('./client', () => ({
  apiClient: { post, get: vi.fn(), delete: del },
  clearAdminSession: vi.fn(),
  startProactiveRefresh: vi.fn(),
}));

const { authApi } = await import('./auth');

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: { avatarUrl: '/uploads/admin-avatars/a.png' } });
  del.mockReset().mockResolvedValue({ data: { avatarUrl: null } });
});

describe('authApi.uploadAvatar', () => {
  it("clears the client's JSON default so axios can add the boundary", async () => {
    await authApi.uploadAvatar(new File(['x'], 'me.png', { type: 'image/png' }));

    const [, , config] = post.mock.calls[0] as [string, unknown, { headers: object }];
    expect(config.headers).toHaveProperty('Content-Type', undefined);
  });

  it('never names the content type itself', async () => {
    /*
     * Writing `multipart/form-data` by hand is the plausible-looking "fix" and
     * is exactly as broken: that header carries no boundary either, so the
     * server has the same unparseable body by a different route.
     */
    await authApi.uploadAvatar(new File(['x'], 'me.png', { type: 'image/png' }));

    const [, , config] = post.mock.calls[0] as [string, unknown, { headers: object }];
    expect(JSON.stringify(config.headers)).not.toContain('multipart');
  });

  it('sends the file under the field name the interceptor reads', async () => {
    // `FileInterceptor('file', …)`. Any other key parses fine and yields no
    // file, which surfaces as the same misleading 400.
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    await authApi.uploadAvatar(file);

    const [path, body] = post.mock.calls[0] as [string, FormData];
    expect(path).toBe('/admin/auth/me/avatar');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBe(file);
  });
});

describe('authApi.removeAvatar', () => {
  it('carries no body, and so needs no header treatment', async () => {
    await authApi.removeAvatar();
    expect(del).toHaveBeenCalledWith('/admin/auth/me/avatar');
  });
});
