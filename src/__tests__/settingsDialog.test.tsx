// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

import { SettingsDialog } from '../components/SettingsDialog';

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

// ไม่ยิงเน็ตจริงในเทสต์
vi.mock('../services/geminiService', () => ({
  testGeminiApiKeyWithSearch: vi.fn(async () => ({ success: true, text: 'ok', searchGrounded: true })),
}));

const CLASSIC_KEY = `AIza${'0123456789abcdefghij_klmnopqrstuvwxy'.slice(0, 35)}`;

const noop = () => {};

function renderDialog(over: Partial<React.ComponentProps<typeof SettingsDialog>> = {}) {
  const onSaveApiKey = vi.fn(async () => {});
  const utils = render(
    <SettingsDialog
      useThb={false}
      onToggleCurrency={noop}
      notificationsEnabled={false}
      onToggleNotifications={noop}
      onSetAlert={noop}
      geminiApiKey=""
      onSaveApiKey={onSaveApiKey}
      psychologySettings={{
        riskToleranceLevel: 'MODERATE',
        enableEmotionalCheckIn: true,
        dailyLimitRiskPct: 2,
      }}
      onSavePsychologySettings={noop}
      onDismiss={noop}
      {...over}
    />
  );
  return { ...utils, onSaveApiKey };
}

/** เปิดโซน API Key ซึ่งพับไว้เป็นค่าเริ่มต้น */
function openKeySection() {
  fireEvent.click(screen.getByRole('button', { name: /ส่วนจัดการ Google Gemini API Key/ }));
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'gemini-3.8-flash',
        fallbackModels: ['gemini-3.6-flash'],
        serverKeyConfigured: false,
      }),
    }))
  );
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  vi.unstubAllGlobals();
});

describe('SettingsDialog — API key configuration', () => {
  it('states the key is stored locally, not synced to the cloud', () => {
    renderDialog();
    expect(screen.getByTestId('settings-storage-note').textContent).toContain('localStorage');
    expect(screen.getByTestId('settings-account-mode').textContent).toContain('เก็บในเครื่อง');
    // ห้ามมีอีเมลส่วนตัวฮาร์ดโค้ดเป็นค่า fallback
    expect(screen.queryByText('sirisakkhacha@gmail.com')).toBeNull();
  });

  it('shows the real model from /api/gemini/config', async () => {
    renderDialog();
    openKeySection();
    await waitFor(() =>
      expect(screen.getAllByText(/gemini-3\.8-flash/).length).toBeGreaterThan(0)
    );
  });

  it('accepts any key format — no prefix requirement', async () => {
    const { onSaveApiKey } = renderDialog();
    openKeySection();

    const input = screen.getByPlaceholderText('วาง API Key ที่นี่ (รูปแบบใดก็ได้)') as HTMLInputElement;
    // คีย์แปลก ๆ ที่ไม่ขึ้นต้นด้วย AIza/AQ. ก็ต้องบันทึกได้
    fireEvent.change(input, { target: { value: 'my-custom-key-12345' } });

    expect(screen.getByTestId('gemini-key-hint').textContent).toMatch(/พร้อมบันทึก/);
    const saveButton = screen.getByRole('button', { name: /บันทึกและซิงค์คีย์/ });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(saveButton);
    await waitFor(() => expect(onSaveApiKey).toHaveBeenCalledWith('my-custom-key-12345'));
  });

  it('keeps save disabled while the field is empty', () => {
    const { onSaveApiKey } = renderDialog();
    openKeySection();

    const saveButton = screen.getByRole('button', { name: /บันทึกและซิงค์คีย์/ });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(saveButton);
    expect(onSaveApiKey).not.toHaveBeenCalled();
    expect(screen.getByTestId('gemini-key-hint').textContent).toContain('ยังไม่ได้ใส่ API Key');
  });

  it('saves a well-formed key after trimming', async () => {
    const { onSaveApiKey } = renderDialog();
    openKeySection();

    const input = screen.getByPlaceholderText('วาง API Key ที่นี่ (รูปแบบใดก็ได้)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: `  ${CLASSIC_KEY}  ` } });
    expect(screen.getByTestId('gemini-key-hint').textContent).toMatch(/พร้อมบันทึก/);

    fireEvent.click(screen.getByRole('button', { name: /บันทึกและซิงค์คีย์/ }));
    await waitFor(() => expect(onSaveApiKey).toHaveBeenCalledWith(CLASSIC_KEY));
  });

  it('shows a masked fingerprint and can remove the stored key', async () => {
    const { onSaveApiKey } = renderDialog({ geminiApiKey: CLASSIC_KEY });
    openKeySection();

    expect(screen.getByText(/AIza••••/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('remove-gemini-key'));
    await waitFor(() => expect(onSaveApiKey).toHaveBeenCalledWith(''));
  });

  it('rejects a price alert without a symbol or with a non-positive price', () => {
    renderDialog();

    const priceField = screen.getByPlaceholderText('95000') as HTMLInputElement;
    const symbolField = screen.getByPlaceholderText('BTC') as HTMLInputElement;

    fireEvent.change(symbolField, { target: { value: '   ' } });
    fireEvent.change(priceField, { target: { value: '100' } });
    fireEvent.submit(screen.getByRole('button', { name: 'บันทึกการแจ้งเตือนราคา' }).closest('form')!);
    expect(screen.getByTestId('alert-error').textContent).toContain('ชื่อสินทรัพย์');

    fireEvent.change(symbolField, { target: { value: 'BTC' } });
    fireEvent.change(priceField, { target: { value: '0' } });
    fireEvent.submit(screen.getByRole('button', { name: 'บันทึกการแจ้งเตือนราคา' }).closest('form')!);
    expect(screen.getByTestId('alert-error').textContent).toContain('มากกว่า 0');
  });
});
