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

export const authApi = {
  async login(dto: AdminLoginDto) {
    const { data } = await apiClient.post<AdminLoginResponse>('/admin/auth/login', dto);
    // Nothing to store: the server sets the session as httpOnly cookies and the
    // browser installs them from this very response (PLATFORM-CONVENTIONS R-3.2).
    // The response carries no tokens at all now — see the type above.
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
};
