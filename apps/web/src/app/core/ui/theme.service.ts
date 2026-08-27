import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'cns.theme';

const initialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Fall through to the system preference.
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** Toggles the `dark` class the Material theme in styles.scss keys off. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<Theme>(initialTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      this.document.documentElement.classList.toggle('dark', theme === 'dark');
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // A remembered preference is a convenience, not a requirement.
      }
    });
  }

  toggle(): void {
    this.theme.update((current) => (current === 'dark' ? 'light' : 'dark'));
  }
}
