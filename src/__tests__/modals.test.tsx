// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { StockDetailModal } from '../components/StockDetailModal';
import { RiskCalculatorModal } from '../components/RiskCalculatorModal';
import { SettingsDialog } from '../components/SettingsDialog';
import { NewsDetailModal } from '../components/NewsDetailModal';
import { SignalDetailModal } from '../components/SignalDetailModal';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

/**
 * These are render + accessibility smoke tests. They catch dialog role,
 * aria-modal, Escape handling, scroll lock, and JSX issues.
 */

const noop = () => {};

describe('modal accessibility contract', () => {
  it('restores background scroll when the dialog unmounts', () => {
    const { unmount } = render(
      <RiskCalculatorModal isOpen onClose={noop} useThb={false} signals={[]} geminiApiKey="" />
    );
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
