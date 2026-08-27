import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { isApiErrorBody, type ApiErrorBody } from '@cns/shared';
import { AuthStore } from './auth.store';
import { ToastService } from '../ui/toast.service';

/** Attaches the bearer token to every call to our own API. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(AuthStore).token();

  if (!token) return next(request);

  return next(
    request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
  );
};

const messageFor = (error: HttpErrorResponse): string => {
  if (error.status === 0) {
    return 'Cannot reach the API. Check that the server is running.';
  }

  const body: unknown = error.error;
  if (isApiErrorBody(body)) {
    const details = (body as ApiErrorBody).error.details;
    // Validation failures are actionable only if the offending field is named.
    if (details?.length) {
      return `${body.error.message}: ${details.map((d) => d.message).join(', ')}`;
    }
    return body.error.message;
  }

  return 'Something went wrong. Please try again.';
};

/**
 * Turns every failed response into one visible, readable message, and signs the
 * user out on a 401 so an expired token cannot leave the UI in a half-dead state.
 *
 * A 401 means two different things depending on whether a session exists: an
 * expired token, or a rejected sign-in. Both must say something - an earlier
 * version reported neither, so a wrong password failed silently.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const toast = inject(ToastService);
  const auth = inject(AuthStore);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401 && auth.isAuthenticated()) {
          auth.logout();
          void router.navigate(['/login']);
          toast.error('Your session expired. Please sign in again.');
        } else {
          // Includes a rejected sign-in, where the API's own wording ("Email or
          // password is incorrect") is exactly what the user needs to see.
          toast.error(messageFor(error));
        }
      }

      return throwError(() => error);
    }),
  );
};
