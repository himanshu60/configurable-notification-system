import { computed, inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import type { AuthResultDto, LoginInput, RegisterInput, UserDto } from '@cns/shared';
import { ApiClient } from '../api/api.client';

const TOKEN_KEY = 'cns.token';
const USER_KEY = 'cns.user';

const readStoredUser = (): UserDto | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserDto) : null;
  } catch {
    // A corrupt or unavailable store must not stop the app from booting.
    return null;
  }
};

const readStoredToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

/**
 * Signal-backed session state.
 *
 * Deliberately not NgRx: the app has one small piece of genuinely global state
 * and a handful of per-feature stores, so signals give the same predictability
 * without the boilerplate. The rationale is recorded in ARCHITECTURE.md.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiClient);

  private readonly _token = signal<string | null>(readStoredToken());
  private readonly _user = signal<UserDto | null>(readStoredUser());

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._token() !== null);
  readonly initials = computed(() => {
    const name = this._user()?.name ?? '';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  });

  login(input: LoginInput) {
    return this.api.post<AuthResultDto>('/auth/login', input).pipe(tap((r) => this.persist(r)));
  }

  register(input: RegisterInput) {
    return this.api.post<AuthResultDto>('/auth/register', input).pipe(tap((r) => this.persist(r)));
  }

  logout(): void {
    this._token.set(null);
    this._user.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }

  private persist(result: AuthResultDto): void {
    this._token.set(result.token);
    this._user.set(result.user);
    try {
      localStorage.setItem(TOKEN_KEY, result.token);
      localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    } catch {
      // Session still works for this tab even if it cannot be persisted.
    }
  }
}
