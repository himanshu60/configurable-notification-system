import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  computed,
  signal,
  type OnInit,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { interval, map, startWith, switchMap } from 'rxjs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthStore } from '../../core/auth/auth.store';
import { ThemeService } from '../../core/ui/theme.service';
import { NotificationsService } from '../../core/api/notifications.service';
import { CatalogService } from '../../core/api/catalog.service';
import { environment } from '../../../environments/environment';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
  { path: '/rules', label: 'Rules', icon: 'rule' },
  { path: '/simulator', label: 'Simulator', icon: 'bolt' },
  { path: '/history', label: 'History', icon: 'history' },
  { path: '/inbox', label: 'Inbox', icon: 'notifications' },
];

/**
 * Application shell: a persistent sidenav on desktop that collapses to an
 * overlay drawer under 900px, driven by the CDK breakpoint observer rather than
 * by CSS alone so the drawer mode itself changes, not just its width.
 */
@Component({
  selector: 'cns-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatBadgeModule,
    MatTooltipModule,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);
  protected readonly auth = inject(AuthStore);
  protected readonly theme = inject(ThemeService);
  protected readonly notifications = inject(NotificationsService);

  protected readonly navItems = NAV_ITEMS;

  protected readonly isHandset = toSignal(
    this.breakpoints
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  /**
   * Desktop and handset keep separate drawer state. Sharing one flag meant the
   * drawer inherited "open" when the viewport narrowed and covered the page.
   */
  private readonly desktopOpen = signal(true);
  private readonly handsetOpen = signal(false);

  protected readonly drawerOpen = computed(() =>
    this.isHandset() ? this.handsetOpen() : this.desktopOpen(),
  );

  ngOnInit(): void {
    // One catalog fetch per session feeds every rule screen.
    this.catalog.load().subscribe();

    // Keeps the unread badge live without a websocket. Documented in
    // ARCHITECTURE.md as the deliberate simple choice for this scope.
    interval(environment.inboxPollIntervalMs)
      .pipe(
        startWith(0),
        switchMap(() => this.notifications.inbox({ limit: 1 })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({ error: () => undefined });
  }

  protected toggleDrawer(): void {
    const target = this.isHandset() ? this.handsetOpen : this.desktopOpen;
    target.update((open) => !open);
  }

  /** The overlay drawer must close after navigation, or it hides the page. */
  protected closeOnHandset(): void {
    if (this.isHandset()) this.handsetOpen.set(false);
  }

  protected onDrawerClosed(): void {
    if (this.isHandset()) this.handsetOpen.set(false);
    else this.desktopOpen.set(false);
  }

  protected signOut(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
