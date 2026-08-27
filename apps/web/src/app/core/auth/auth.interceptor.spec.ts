import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor, errorInterceptor } from './auth.interceptor';
import { AuthStore } from './auth.store';
import { ToastService } from '../ui/toast.service';

describe('http interceptors', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: AuthStore;
  let toastErrors: string[];
  let navigatedTo: unknown[][];

  beforeEach(() => {
    localStorage.clear();
    toastErrors = [];
    navigatedTo = [];

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        {
          provide: ToastService,
          useValue: {
            error: (message: string) => toastErrors.push(message),
            success: () => undefined,
            info: () => undefined,
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: (commands: unknown[]) => {
              navigatedTo.push(commands);
              return Promise.resolve(true);
            },
          },
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthStore);
  });

  afterEach(() => controller.verify());

  it('sends no Authorization header when there is no session', () => {
    http.get('/api/v1/rules').subscribe();

    const request = controller.expectOne('/api/v1/rules');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ data: [] });
  });

  it('attaches the bearer token once signed in', () => {
    auth['_token'].set('test-token');

    http.get('/api/v1/rules').subscribe();

    const request = controller.expectOne('/api/v1/rules');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush({ data: [] });
  });

  it('surfaces the API error message rather than a generic one', () => {
    http.get('/api/v1/rules').subscribe({ error: () => undefined });

    controller.expectOne('/api/v1/rules').flush(
      { error: { code: 'INTERNAL_ERROR', message: 'Something exploded' } },
      { status: 500, statusText: 'Server Error' },
    );

    expect(toastErrors).toContain('Something exploded');
  });

  it('spells out which fields failed validation', () => {
    http.post('/api/v1/rules', {}).subscribe({ error: () => undefined });

    controller.expectOne('/api/v1/rules').flush(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request failed validation',
          details: [{ path: 'name', message: 'Name is required' }],
        },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(toastErrors[0]).toContain('Name is required');
  });

  it('says the API is unreachable instead of showing a blank error', () => {
    http.get('/api/v1/rules').subscribe({ error: () => undefined });

    controller
      .expectOne('/api/v1/rules')
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(toastErrors[0]).toContain('Cannot reach the API');
  });

  it('clears an expired session and sends the user back to sign in', () => {
    auth['_token'].set('expired-token');

    http.get('/api/v1/rules').subscribe({ error: () => undefined });

    controller
      .expectOne('/api/v1/rules')
      .flush({ error: { code: 'UNAUTHORIZED', message: 'expired' } }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isAuthenticated()).toBe(false);
    expect(navigatedTo).toContainEqual(['/login']);
  });

  it('reports a rejected sign-in instead of failing silently', () => {
    // Regression: a 401 with no active session matched neither branch, so a
    // wrong password produced no message at all.
    http.post('/api/v1/auth/login', {}).subscribe({ error: () => undefined });

    controller
      .expectOne('/api/v1/auth/login')
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Email or password is incorrect' } },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(toastErrors).toContain('Email or password is incorrect');
  });

  it('does not redirect on a 401 when there was no session to begin with', () => {
    http.get('/api/v1/auth/login').subscribe({ error: () => undefined });

    controller
      .expectOne('/api/v1/auth/login')
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Email or password is incorrect' } },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(navigatedTo).toHaveLength(0);
  });
});
