// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { CalendarModal } from '../components/CalendarModal';
import { StockDetailModal } from '../components/StockDetailModal';
import { RiskCalculatorModal } from '../components/RiskCalculatorModal';
import { SettingsDialog } from '../components/SettingsDialog';
import { NewsDetailModal } from '../components/NewsDetailModal';
import { SignalDetailModal } from '../components/SignalDetailModal';

// Firebase initialises an Auth instance on import; in happy-dom/jsdom that
// logs an "operation-not-supported-in-this-environment" warning. The modals
// never touch auth during these renders, so stub the module out.
vi.mock('firebase/auth', () => ({
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  GoogleAuthProvider: { credentialFromResult: vi.fn() },
  getAuth: vi.fn(() => ({ currentUser: null })),
}));

vi.mock('../firebase', () => ({
  auth: { currentUser: null },
  db: {},
  googleProvider: { setCustomParameters: vi.fn(), addScope: vi.fn() },
  workspaceGoogleProvider: { setCustomParameters: vi.fn(), addScope: vi.fn() },
  GMAIL_SCOPES: [],
  CALENDAR_SCOPES: [],
  CHAT_SCOPES: [],
}));

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

/**
 * These are render + accessibility smoke tests. They exist because every modal
 * used to be a bare <div className="fixed inset-0">: no role, no aria-modal,
 * no Escape handling and no scroll lock. They also catch JSX breakage in the
 * 900-line modal components, which `tsc` alone cannot fully protect.
 */

const noop = () => {};

describe('modal accessibility contract', () => {
  it('CalendarModal exposes a labelled dialog, locks scroll and closes on Escape', () => {
    const onClose = vi.fn();
    render(<CalendarModal isOpen onClose={onClose} userEmail="trader@example.com" />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('ปฏิทินกิจกรรม Google Calendar');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores background scroll when the dialog unmounts', () => {
    const { unmount } = render(<CalendarModal isOpen onClose={noop} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('StockDetailModal is a labelled dialog and Escape dismisses it', () => {
    const onDismiss = vi.fn();
    render(
      <StockDetailModal
        symbol="PTT"
        name="ปตท."
        price={34.25}
        change={2.1}
        isThaiStock
        useThb
        usdThbRate={34.12}
        geminiApiKey=""
        onDismiss={onDismiss}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('รายละเอียดหุ้น PTT');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('RiskCalculatorModal and SettingsDialog render as dialogs', () => {
    const { unmount } = render(
      <RiskCalculatorModal isOpen onClose={noop} useThb={false} signals={[]} geminiApiKey="" />
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    unmount();

    render(
      <SettingsDialog
        useThb={false}
        onToggleCurrency={noop}
        notificationsEnabled={false}
        onToggleNotifications={noop}
        onSetAlert={noop}
        geminiApiKey=""
        onSaveApiKey={async () => {}}
        userEmail="trader@example.com"
        priceAlerts={[]}
        onRemoveAlert={noop}
        psychologySettings={{ riskToleranceLevel: 'MODERATE', enableEmotionalCheckIn: true, dailyLimitRiskPct: 2 }}
        onSavePsychologySettings={noop}
        onDismiss={noop}
      />
    );
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('ตั้งค่าและคีย์ API');
  });

  it('closed / empty states render nothing instead of an empty overlay', () => {
    const { container: newsContainer } = render(
      <NewsDetailModal article={null} geminiApiKey="" onClose={noop} />
    );
    expect(newsContainer.innerHTML).toBe('');

    const { container: signalContainer } = render(
      <SignalDetailModal signal={null} useThb={false} geminiApiKey="" onDismiss={noop} />
    );
    expect(signalContainer.innerHTML).toBe('');
  });

  it('icon-only close buttons have accessible names', () => {
    render(
      <SettingsDialog
        useThb={false}
        onToggleCurrency={noop}
        notificationsEnabled={false}
        onToggleNotifications={noop}
        onSetAlert={noop}
        geminiApiKey=""
        onSaveApiKey={async () => {}}
        psychologySettings={{ riskToleranceLevel: 'MODERATE', enableEmotionalCheckIn: true, dailyLimitRiskPct: 2 }}
        onSavePsychologySettings={noop}
        onDismiss={noop}
      />
    );
    expect(screen.getByRole('button', { name: 'ปิดหน้าต่างตั้งค่า' })).toBeTruthy();
  });
});
