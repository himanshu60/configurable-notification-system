import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
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
  }

  protected signIn(): void {
    if (this.loginForm.invalid || this.submitting()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.auth.login(this.loginForm.getRawValue()).subscribe({
      next: (result) => this.onAuthenticated(`Welcome back, ${result.user.name.split(' ')[0]}`),
      error: () => this.submitting.set(false),
    });
  }

  protected signUp(): void {
    if (this.registerForm.invalid || this.submitting()) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.auth.register(this.registerForm.getRawValue()).subscribe({
      next: () => this.onAuthenticated('Account created'),
      error: () => this.submitting.set(false),
    });
  }

  private onAuthenticated(message: string): void {
    this.submitting.set(false);
    this.toast.success(message);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
    void this.router.navigateByUrl(returnUrl);
  }
}
