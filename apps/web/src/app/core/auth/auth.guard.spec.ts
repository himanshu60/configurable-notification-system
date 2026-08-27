import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  provideRouter,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { authGuard, guestGuard } from './auth.guard';
import { AuthStore } from './auth.store';

describe('route guards', () => {
  let auth: AuthStore;

  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/rules' } as RouterStateSnapshot;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    auth = TestBed.inject(AuthStore);
  });

  const runAuthGuard = () => TestBed.runInInjectionContext(() => authGuard(route, state));
  const runGuestGuard = () => TestBed.runInInjectionContext(() => guestGuard(route, state));

  it('lets a signed-in user through', () => {
    auth['_token'].set('token');
    expect(runAuthGuard()).toBe(true);
  });

  it('redirects an anonymous visitor to sign in', () => {
    expect(runAuthGuard()).toBeInstanceOf(UrlTree);
  });

  it('remembers where the visitor was heading', () => {
    const result = runAuthGuard() as UrlTree;
    expect(result.queryParams['returnUrl']).toBe('/rules');
  });

  it('keeps a signed-in user off the login page', () => {
    auth['_token'].set('token');
    expect(runGuestGuard()).toBeInstanceOf(UrlTree);
  });

  it('lets an anonymous visitor reach the login page', () => {
    expect(runGuestGuard()).toBe(true);
  });
});
