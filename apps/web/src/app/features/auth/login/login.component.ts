import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { HttpErrorResponse } from '@angular/common/http';
import { isApiErrorBody } from '@cns/shared';
import { AuthStore } from '../../../core/auth/auth.store';
import { ThemeService } from '../../../core/ui/theme.service';
import { ToastService } from '../../../core/ui/toast.service';

type Mode = 'signin' | 'signup';

@Component({
  selector: 'cns-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  protected readonly theme = inject(ThemeService);

  protected readonly submitting = signal(false);
  /** Shown in the card itself; a toast alone is easy to miss mid-typing. */
  protected readonly formError = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly mode = signal<Mode>('signin');

  /** Typed non-nullable forms: no `string | null` leaking into the payload. */
  protected readonly loginForm = this.fb.nonNullable.group({
    email: ['demo@cns.dev', [Validators.required, Validators.email]],
    password: ['Password123!', [Validators.required]],
  });

  protected readonly registerForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.showPassword.set(false);
    this.formError.set(null);
  }

  /** Prefers the API's own wording over a generic fallback. */
  private describe(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Cannot reach the server. Check your connection.';
      if (isApiErrorBody(error.error)) return error.error.error.message;
    }
    return fallback;
  }

  protected signIn(): void {
    if (this.loginForm.invalid || this.submitting()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.formError.set(null);
    this.submitting.set(true);
    this.auth.login(this.loginForm.getRawValue()).subscribe({
      next: (result) => this.onAuthenticated(`Welcome back, ${result.user.name.split(' ')[0]}`),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.formError.set(this.describe(error, 'Sign in failed. Please try again.'));
      },
    });
  }

  protected signUp(): void {
    if (this.registerForm.invalid || this.submitting()) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.formError.set(null);
    this.submitting.set(true);
    this.auth.register(this.registerForm.getRawValue()).subscribe({
      next: () => this.onAuthenticated('Account created'),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.formError.set(this.describe(error, 'Could not create the account.'));
      },
    });
  }

  private onAuthenticated(message: string): void {
    this.submitting.set(false);
    this.formError.set(null);
    this.toast.success(message);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
    void this.router.navigateByUrl(returnUrl);
  }
}
