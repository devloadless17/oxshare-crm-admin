import { apiClient, clearAdminSession, startProactiveRefresh } from './client';
import type { components } from './types.gen';

/**
 * An ALIAS, not a hand-written copy — R-1.1.
 *
 * This was declared by hand while the generated schema existed at
 * `components['schemas']['AdminLoginDto']`. A required field added to the login
 * body backend-side would have compiled clean here and broken every admin login
 * at runtime — which is the exact failure the typegen mechanism exists to turn
 * into a build error.
 */
export type AdminLoginDto = components['schemas']['AdminLoginDto'];

/**
 * `POST /admin/auth/login`.
 *
 * A straight alias now: the endpoint carries a response DTO, so a change to the
 * shape is a compile error here rather than a runtime surprise.
 *
 * There are no token fields any more, deliberately. The session is set as
 * httpOnly cookies on the same response, and returning the tokens in the body
 * as well handed JavaScript the exact credential that flag exists to keep away
 * from it. While they existed, an older build of this app kept reading them and
 * writing its own JS-readable `admin_access_token` cookie — so clearing the
 * browser and logging in again recreated the exposure the migration removed.
 */
export type AdminLoginResponse = components['schemas']['AdminLoginResponseDto'];

/**
 * What a right password buys (0191): NOT a session. `step: 'totp'` — ask for
 * the 6-digit code from the authenticator app; `step: 'totp_setup'` — no app
 * set up yet, show the QR code first. `challengeToken` goes back with either.
 */
export type AdminSignInChallenge = components['schemas']['AdminSignInChallengeDto'];

/** `POST /admin/auth/totp/setup` — the QR code (SVG) and the secret as text. */
export type AdminTotpSetup = components['schemas']['AdminTotpSetupDto'];

/** `POST /admin/auth/change-password` — the body. */
export type AdminChangePasswordDto = components['schemas']['AdminChangePasswordDto'];

/** `PATCH /admin/auth/me` — the body. The display name, and nothing else. */
export type AdminUpdateProfileDto = components['schemas']['AdminUpdateProfileDto'];

/**
 * One live session — one LOGIN, not one token row.
 *
 * `current` marks the session this browser is on. The profile screen labels it
 * and hides its sign-out button, because ending it here would revoke the family
 * while leaving the httpOnly cookies in place: the console would sit rendered
 * until the next request 401'd. Sign out is the operation that does both.
 */
export type AdminSession = components['schemas']['AdminSessionDto'];

/** Where a profile photo is served from, or `null` when there is none. */
export type AdminAvatarResponse = components['schemas']['AdminAvatarResponseDto'];

export const authApi = {
  /** Step one: the password. Answers with a challenge — no session yet. */
  async login(dto: AdminLoginDto) {
    const { data } = await apiClient.post<AdminSignInChallenge>('/admin/auth/login', dto);
    return data;
  },

  /** Enrolment: a fresh secret as a QR code. Each call replaces the last one. */
  async totpSetup(challengeToken: string) {
    const { data } = await apiClient.post<AdminTotpSetup>('/admin/auth/totp/setup', {
      challengeToken,
    });
    return data;
  },

  /** Step two: the code from the app. This is the call that starts the session. */
  async totpVerify(challengeToken: string, code: string) {
    const { data } = await apiClient.post<AdminLoginResponse>('/admin/auth/totp/verify', {
      challengeToken,
      code,
    });
    // Nothing to store: the server sets the session as httpOnly cookies and the
    // browser installs them from this very response (PLATFORM-CONVENTIONS R-3.2).
    startProactiveRefresh();
    return data;
  },

  /**
   * The only logout. Previously there were two halves that never met: this
   * helper cleared cookies without telling the server (so the refresh token
   * stayed valid for 30 days), and the auth context called the API without
   * clearing cookies (so proxy.ts still saw a session and bounced the admin
   * straight back in).
   */
  /**
   * Ends the session, and REPORTS whether it actually ended.
   *
   * The failure this closes is quiet and specific to how logout works now. Since
   * R-3.2 this app cannot delete a session cookie — they are httpOnly — and
   * `clearAdminSession()` deliberately clears nothing but a timer. So the server
   * call is the *only* thing that ends a session: it revokes every refresh-token
   * family and sends the Set-Cookie headers that remove the cookies.
   *
   * Swallowing its failure in `finally` therefore did not mean "logged out
   * locally, not remotely" — it meant NOT LOGGED OUT AT ALL, while the admin was
   * shown a clean login screen and walked away from a shared back-office machine
   * whose browser still held a live 30-day session. The next person to open the
   * app would have been signed in as them, with whatever permissions they hold.
   *
   * One retry first, because the common cause is a transient blip and asking
   * somebody to click logout again is a poor answer to a network hiccup.
   */
  async logout(): Promise<void> {
    /*
     * This route never answers 401 for an expired ACCESS token: it carries no
     * AdminGuard, takes its identity from the refresh cookie, and clears the
     * cookies regardless. So an operator whose access token lapsed hours ago
     * can still sign out — the retry below is for transport blips, not for a
     * session the interceptor would otherwise have had to renew first.
     */
    try {
      await apiClient.post('/admin/auth/logout');
    } catch {
      // Second attempt, then give up and tell the caller. `clearAdminSession()`
      // is NOT called on the failure path: stopping the proactive refresh while
      // the server session is still alive would only hide the problem further.
      await apiClient.post('/admin/auth/logout');
    }
    clearAdminSession();
  },

  // ── Self-service ──────────────────────────────────────────────────────────
  //
  // Every call below acts on the CALLER's own account and needs no permission,
  // so the profile screen is the one console page with no `ROUTE_REQUIREMENTS`
  // keys — see `permissions.ts`.

  /**
   * Change the password, and stay signed in.
   *
   * The server revokes EVERY session including this one and issues a fresh
   * pair of cookies on the same response, so nothing here has to re-login. It
   * does mean the CSRF token rotates: `apiClient` reads it per request rather
   * than caching it, which is what makes the next call after this one work.
   */
  async changePassword(dto: AdminChangePasswordDto) {
    const { data } = await apiClient.post<{ message: string }>('/admin/auth/change-password', dto);
    return data;
  },

  /**
   * Change the display name.
   *
   * The API trims before storing, so the value that comes back is the value
   * that was saved — which is why the response is read rather than assumed. A
   * form echoing its own input would show " Ada " as saved when "Ada" is what
   * every other screen will show.
   */
  async updateProfile(dto: AdminUpdateProfileDto) {
    const { data } = await apiClient.patch<{ name: string }>('/admin/auth/me', dto);
    return data;
  },

  async sessions(signal?: AbortSignal) {
    const { data } = await apiClient.get<AdminSession[]>('/admin/auth/sessions', { signal });
    return data;
  },

  async revokeSession(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/admin/auth/sessions/${id}`);
    return data;
  },

  /**
   * Upload the profile photo.
   *
   * `Content-Type: undefined` is DELETING a default, not omitting a header, and
   * the upload does not work without it.
   *
   * A multipart body is unparseable without the `boundary` token that only the
   * sender can generate, and axios generates it — but only when the header is
   * unset. `apiClient` sets `'Content-Type': 'application/json'` as an instance
   * default, so axios saw the field already filled, left it alone, and posted a
   * `FormData` body labelled as JSON. Multer then found no multipart request to
   * parse, the handler's own `if (!file)` fired, and the API answered
   * `400 VALIDATION_FAILED: No file was uploaded.` — which reads as "the file
   * did not reach the server" and sends you looking at the file input.
   *
   * `undefined` removes the instance default for this one request and lets
   * axios do its job. Writing `'multipart/form-data'` by hand does NOT work
   * either: that header carries no boundary, so the server has the same
   * unparseable body by a different route. The portal's `accountApi.uploadAvatar`
   * carries the same line for the same reason.
   */
  async uploadAvatar(file: File) {
    const body = new FormData();
    body.append('file', file);
    const { data } = await apiClient.post<AdminAvatarResponse>('/admin/auth/me/avatar', body, {
      headers: { 'Content-Type': undefined },
    });
    return data;
  },

  async removeAvatar() {
    const { data } = await apiClient.delete<AdminAvatarResponse>('/admin/auth/me/avatar');
    return data;
  },
};
