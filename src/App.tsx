import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, Sparkles, X, Star, History, Radio } from 'lucide-react';
import { signOut, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { auth, db, googleProvider } from './firebase';
import { getCachedAccessToken, setCachedAccessToken } from './services/gmailService';
import {
  downloadDailyCsvExport,
  exportDailyCsvToDriveFolder,
} from './services/dailyCsvExportService';
import { doc, onSnapshot } from 'firebase/firestore';
import { AtsMatrixDashboard } from './components/AtsMatrixDashboard';
import { isAtsMatrixTrigger } from './services/atsMatrixService';
import { GLOBAL_ROOM_ID, sendRoomMessage } from './services/chatRoomService';
import {
  CryptoCoin,
  ForexPair,
  StockIndex,
  TradingSignal,
  NewsArticle,
  ChartData,
  MarketHoursInfo,
  ApiStatusState,
  ThaiStock,
  ForeignStock,
  TradingPsychologySettings,
} from './types';
import {
  CRYPTO_INITIAL,
  STOCK_SYMBOLS,
  THAI_STOCKS,
  FOREIGN_STOCKS,
  startBinanceWebSocket,
  fetchCryptoPrices,
  fetchForexRates,
  fetchNews,
  fetchStockIndices,
  computeMarketHours,
  fetchPriceHistory,
  generateRealSignals,
  generateForexSignals,
  fetchThaiStockPrices,
  fetchForeignStockPrices,
  generateThaiStockSignals,
  generateForeignStockSignals,
} from './services/apiClient';
import { categorizeHeadlinesWithGemini } from './services/headlineCategorizationService';
import { t } from './i18n';
import { getLiveUsdThb, setActiveUsdThbRate } from './utils';
import { useModalA11y } from './hooks/useModalA11y';
import { Header } from './components/Header';
import { CryptoCard } from './components/CryptoCard';
import { ForexCard } from './components/ForexCard';
import { StockCard } from './components/StockCard';
import { ThaiStockCard } from './components/ThaiStockCard';
import { ForeignStockCard } from './components/ForeignStockCard';
import { PriceChartCanvas } from './components/PriceChartCanvas';
import { MarketHoursCard } from './components/MarketHoursCard';
import { NewsCard } from './components/NewsCard';
import { SystemHealthPanel } from './components/SystemHealthPanel';
import { SignalDetailModal } from './components/SignalDetailModal';
import { ForexDetailModal } from './components/ForexDetailModal';
import { StockDetailModal } from './components/StockDetailModal';
import { SettingsDialog } from './components/SettingsDialog';
import { HistoryList } from './components/HistoryList';
import { TradingHistoryEntry } from './types';
import { GmailModal } from './components/GmailModal';
import { CalendarModal } from './components/CalendarModal';
import { ChatModal } from './components/ChatModal';
import { RiskCalculatorModal } from './components/RiskCalculatorModal';
import { DrawdownAlertBanner } from './components/DrawdownAlertBanner';
import { DrawdownMonitorModal } from './components/DrawdownMonitorModal';
import {
  autoPeakValues,
  loadAutoPeaks,
  observationsFromFeeds,
  saveAutoPeaks,
  trackPeaks,
  type AutoPeakBook,
} from './services/peakTracker';
import { MascotOverlay } from './components/MascotOverlay';
import { useMascotStore } from './services/mascotService';
import {
  publishMascotFeed,
  requestAtsDashboardTab,
  useMascotFeed,
  type MascotWindowContext,
  type MascotWindowSurface,
} from './mascot/feed';
import { registerMascotActionHandlers, type MascotMarket } from './mascot/actions';
import { announceMascot } from './mascot/announce';
import { syncMarketArchivesToFirestore } from './services/firestoreArchiveSync';
import {
  buildDrawdownAssets,
  computePortfolioDrawdownSummary,
  loadThresholds,
  saveThresholds,
  loadCustomPeaks,
  saveCustomPeak,
  playDrawdownAlertChime,
} from './services/drawdownService';
import { DrawdownThresholds } from './types';
import {
  subscribeUserSettings,
  saveUserSettings,
  subscribeUserHistory,
  addHistoryEntry,
  deleteHistoryEntry,
  clearAllUserHistory,
} from './services/firebaseSync';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => auth.currentUser || ({ uid: 'guest', displayName: 'Guest' } as unknown as User));
  const [authReady, setAuthReady] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        setUser({ uid: 'guest', displayName: 'Guest' } as unknown as User);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser({ uid: 'guest', displayName: 'Guest' } as unknown as User);
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCachedAccessToken(credential.accessToken);
      }
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Error signing in with Google:', error);
    }
  };

  // State
  const [cryptoList, setCryptoList] = useState<CryptoCoin[]>(CRYPTO_INITIAL);
  const [forexRates, setForexRates] = useState<ForexPair[]>([]);
  const [stockIndices, setStockIndices] = useState<StockIndex[]>(STOCK_SYMBOLS);
  /* สัญญาณคริปโตคำนวณจาก cryptoList ตรง ๆ (derived state)
     เดิมใช้ state + interval 15 วิ ทำให้การ์ดแสดงราคาสดแต่ SL/TP มาจากราคาเก่า
     (ผู้ใช้เห็น LONG ราคา $71,692 แต่ SL $90,364) — ตอนนี้คำนวณใหม่ทุกครั้งที่ราคาเปลี่ยน */
  const signals: TradingSignal[] = useMemo(() => generateRealSignals(cryptoList), [cryptoList]);

  const [forexSignals, setForexSignals] = useState<TradingSignal[]>([]);
  const [thaiStocks, setThaiStocks] = useState<ThaiStock[]>(THAI_STOCKS);
  const [foreignStocks, setForeignStocks] = useState<ForeignStock[]>(FOREIGN_STOCKS);
  const [thaiStockSignals, setThaiStockSignals] = useState<TradingSignal[]>([]);
  const [foreignStockSignals, setForeignStockSignals] = useState<TradingSignal[]>([]);
  const [selectedThaiStock, setSelectedThaiStock] = useState<ThaiStock | null>(null);
  const [selectedForeignStock, setSelectedForeignStock] = useState<ForeignStock | null>(null);
  const [newsList, setNewsList] = useState<NewsArticle[]>([]);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [chartLoading, setChartLoading] = useState<boolean>(true);
  const [selectedChartAsset, setSelectedChartAsset] = useState<string>('bitcoin');

  const [marketHours, setMarketHours] = useState<MarketHoursInfo>(() =>
    computeMarketHours()
  );
  const [apiStatus, setApiStatus] = useState<ApiStatusState>({
    binanceWs: 'CONNECTING',
    coinGecko: 'CONNECTING',
    forex: 'CONNECTING',
    news: 'CONNECTING',
    signals: 'LIVE',
    stocks: 'CONNECTING',
    isChecking: false,
    lastChecked: undefined,
  });

  const [selectedTab, setSelectedTab] = useState<number>(0);
  const [showNewsModal, setShowNewsModal] = useState<boolean>(false);
  const [showWatchlistModal, setShowWatchlistModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showAtsMatrixModal, setShowAtsMatrixModal] = useState<boolean>(false);
  const [isAtsMatrixMode, setIsAtsMatrixMode] = useState<boolean>(false);

  // Accessibility wiring for the four inline dialogs rendered in this component.
  const newsModalRef = useModalA11y({ onClose: () => setShowNewsModal(false), enabled: showNewsModal });
  const watchlistModalRef = useModalA11y({ onClose: () => setShowWatchlistModal(false), enabled: showWatchlistModal });
  const historyModalRef = useModalA11y({ onClose: () => setShowHistoryModal(false), enabled: showHistoryModal });
  const atsModalRef = useModalA11y({ onClose: () => setShowAtsMatrixModal(false), enabled: showAtsMatrixModal });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [useThb, setUseThb] = useState<boolean>(false);
  // The dashboard is dark-only by design: only 8 of 26 components implement a
  // light palette, so the old 06:00–18:00 auto-flip half-inverted the UI.
  const [isDark] = useState<boolean>(true);

  // Mascot: initial onboarding greeting (kept from the Co-Pilot feature).
  useEffect(() => {
    const openTimer = setTimeout(() => {
      useMascotStore.getState().setMascotState('ONBOARDING');
    }, 1500);
    const closeTimer = setTimeout(() => {
      useMascotStore.getState().resetToIdle();
    }, 11500);
    return () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    };
  }, []);

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [priceAlerts, setPriceAlerts] = useState<
    Array<{ symbol: string; targetPrice: number }>
  >([]);
  const [alertToast, setAlertToast] = useState<string | null>(null);

  const [selectedSignal, setSelectedSignal] = useState<TradingSignal | null>(null);
  const [selectedForex, setSelectedForex] = useState<ForexPair | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showGmail, setShowGmail] = useState<boolean>(false);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [showChat, setShowChat] = useState<boolean>(false);
  // A question carried from the mascot into the chat composer (never auto-sent).
  const [chatSeed, setChatSeed] = useState<string>('');
  const [showRiskCalc, setShowRiskCalc] = useState<boolean>(false);
  const [showDrawdownModal, setShowDrawdownModal] = useState<boolean>(false);
  const [drawdownDismissed, setDrawdownDismissed] = useState<boolean>(false);
  const [drawdownThresholds, setDrawdownThresholds] = useState<DrawdownThresholds>(loadThresholds);
  const [customPeaks, setCustomPeaks] = useState<Record<string, number>>(loadCustomPeaks);
  // จุดพีคที่ AI เก็บให้อัตโนมัติ (high-water mark จากราคาสด)
  const [autoPeaks, setAutoPeaks] = useState<AutoPeakBook>(loadAutoPeaks);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [historyEntries, setHistoryEntries] = useState<TradingHistoryEntry[]>([]);
  const [globalSession, setGlobalSession] = useState<any>(null);
  /* eslint-disable-next-line */
  const [psychologySettings, setPsychologySettings] = useState<TradingPsychologySettings>({
    riskToleranceLevel: 'MODERATE',
    enableEmotionalCheckIn: true,
    dailyLimitRiskPct: 2,
  });

  // Music removed.

  useEffect(() => {
    if (!authReady || !user || user.uid === 'guest') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const docRef = doc(db, 'sessions', 'global');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setGlobalSession(docSnap.data());
        }
      },
      (e: { code?: string; message?: string }) => {
        if (e?.code === 'unavailable' || e?.code === 'permission-denied') return;
        console.warn('Firestore global session listener warning:', e?.code || e?.message);
      }
    );
    return () => unsubscribe();
  }, [authReady, user?.uid]);

  // Background Cloud Firestore sync for 1,000-day historical archives & anomaly records
  useEffect(() => {
    if (!authReady || !user || user.uid === 'guest') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void syncMarketArchivesToFirestore(user.uid);
    const timer = setInterval(() => {
      if (document.hidden) return;
      void syncMarketArchivesToFirestore(user.uid);
    }, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [authReady, user?.uid]);

  // AI ตั้งจุดพีคอัตโนมัติแบบเรียลไทม์ — ทุกครั้งที่ฟีดราคาใหม่เข้ามา
  // (คริปโต/หุ้นไทย/หุ้นต่างประเทศ/ฟอเร็กซ์ อัปเดตทุก 15 วินาที) ระบบจะเก็บ
  // high-water mark ไว้ใน localStorage ⇒ drawdown ทำงานได้ทันทีโดยไม่ต้อง onboard
  useEffect(() => {
    setAutoPeaks((prev) => {
      const next = trackPeaks(
        prev,
        observationsFromFeeds({ cryptoList, thaiStocks, foreignStocks, forexRates })
      );
      if (next !== prev) saveAutoPeaks(next);
      return next;
    });
  }, [cryptoList, thaiStocks, foreignStocks, forexRates]);

  const aiPeakValues = useMemo(() => autoPeakValues(autoPeaks), [autoPeaks]);

  // Computed Drawdown Assets & Portfolio Risk Summary
  const drawdownAssets = useMemo(
    () =>
      buildDrawdownAssets({
        cryptoList,
        thaiStocks,
        foreignStocks,
        forexRates,
        thresholds: drawdownThresholds,
        customPeaks,
        autoPeaks: aiPeakValues,
      }),
    [cryptoList, thaiStocks, foreignStocks, forexRates, drawdownThresholds, customPeaks, aiPeakValues]
  );

  const portfolioDrawdownSummary = useMemo(
    () => computePortfolioDrawdownSummary(drawdownAssets),
    [drawdownAssets]
  );

  const breachedDrawdownAssets = useMemo(
    () => drawdownAssets.filter((a) => a.status !== 'NORMAL'),
    [drawdownAssets]
  );

  const criticalOrExtremeAssets = useMemo(
    () => drawdownAssets.filter((a) => a.status === 'CRITICAL' || a.status === 'EXTREME'),
    [drawdownAssets]
  );

  // Play audio chime when critical drawdown threshold is newly breached
  const prevBreachedCountRef = useRef<number>(0);
  useEffect(() => {
    const criticalCount = criticalOrExtremeAssets.length;
    if (
      criticalCount > 0 &&
      criticalCount > prevBreachedCountRef.current &&
      drawdownThresholds.soundEnabled
    ) {
      playDrawdownAlertChime('CRITICAL');
      // The mascot's own observer raises KILL_SWITCH_ACTIVE from the breach
      // count published to mascot/feed.ts — one owner for that decision.
    }
    prevBreachedCountRef.current = criticalCount;
  }, [criticalOrExtremeAssets.length, drawdownThresholds.soundEnabled]);

  const handleSendDrawdownToChat = async (reportText: string) => {
    try {
      const senderUid = user?.uid || 'local';
      const senderName = user?.displayName || user?.email || 'Trader';
      await sendRoomMessage(GLOBAL_ROOM_ID, {
        uid: senderUid,
        name: senderName,
        photoURL: user?.photoURL ?? null,
        text: reportText,
      });
      setAlertToast('⚡ ส่งรายงาน Drawdown เข้าห้อง AI Deep Analyze เรียบร้อยแล้ว');
      setTimeout(() => setAlertToast(null), 3000);
    } catch (err: unknown) {
      console.error('Failed to send Drawdown report to chat', err);
      setAlertToast(err instanceof Error ? err.message : 'ส่งข้อความไม่สำเร็จ');
      setTimeout(() => setAlertToast(null), 3500);
    }
  };

  const handleSendAtsToChat = async (reportText: string) => {
    try {
      const senderUid = user?.uid || 'guest';
      const senderName = user?.displayName || user?.email || 'Trader (Guest)';
      await sendRoomMessage(GLOBAL_ROOM_ID, {
        uid: senderUid,
        name: senderName,
        photoURL: user?.photoURL ?? null,
        text: reportText,
      });
      setAlertToast('⚡ ส่งรายงาน ATS Matrix เข้าห้อง AI Deep Analyze เรียบร้อยแล้ว');
      setTimeout(() => setAlertToast(null), 3000);
    } catch (err: unknown) {
      console.error('Failed to send ATS report to chat', err);
      setAlertToast(err instanceof Error ? err.message : 'ส่งข้อความไม่สำเร็จ');
      setTimeout(() => setAlertToast(null), 3500);
    }
  };

  // 0. User Settings & History Sync (Local Device & Google Account)
  useEffect(() => {
    const targetUid = user?.uid || 'local';

    // Subscribe to User Settings (API Key, Watchlist, Alerts, Currency)
    const unsubSettings = subscribeUserSettings(targetUid, (data) => {
      if (data.geminiApiKey !== undefined) setGeminiApiKey(data.geminiApiKey);
      if (data.watchlist !== undefined) setWatchlist(new Set(data.watchlist));
      if (data.priceAlerts !== undefined) setPriceAlerts(data.priceAlerts);
      if (data.useThb !== undefined) setUseThb(data.useThb);
      if (data.notificationsEnabled !== undefined)
        setNotificationsEnabled(data.notificationsEnabled);
      if (data.psychologySettings !== undefined)
        setPsychologySettings(data.psychologySettings);
    });

    // Subscribe to User Trading and AI Analysis History
    const unsubHistory = subscribeUserHistory(targetUid, (items) => {
      setHistoryEntries(items);
    });

    return () => {
      unsubSettings();
      unsubHistory();
    };
  }, [user]);

  // Refs for tracking updates
  const wsRef = useRef<WebSocket | null>(null);
  const forexRef = useRef<ForexPair[]>([]);
  forexRef.current = forexRates;
  const cryptoListRef = useRef<CryptoCoin[]>(cryptoList);
  cryptoListRef.current = cryptoList;
  const thaiRef = useRef<ThaiStock[]>(thaiStocks);
  thaiRef.current = thaiStocks;
  const foreignRef = useRef<ForeignStock[]>(foreignStocks);
  foreignRef.current = foreignStocks;
  const indexRef = useRef<StockIndex[]>(stockIndices);
  indexRef.current = stockIndices;
  const newsRef = useRef<NewsArticle[]>(newsList);
  newsRef.current = newsList;

  // 1. Memoized API Update Functions with Error Handling & Failover
  const updateCryptoPrices = useCallback(async () => {
    try {
      const prices = await fetchCryptoPrices();
      const hasLivePrices = Array.isArray(prices) && prices.some((p) => p.price > 0);
      if (hasLivePrices) {
        setCryptoList((prev) =>
          prev.map((c) => {
            const match = prices.find((p) => p.id === c.id);
            return match ? { ...c, ...match, flash: 'NONE' } : c;
          })
        );
        setApiStatus((prev) => ({
          ...prev,
          coinGecko: 'LIVE',
        }));
      } else {
        setApiStatus((prev) => ({
          ...prev,
          coinGecko: 'FALLBACK',
        }));
      }
    } catch (err) {
      console.warn('Crypto REST fetch failed:', err);
      setApiStatus((prev) => ({ ...prev, coinGecko: 'OFFLINE' }));
    }
  }, []);

  const updateForex = useCallback(async () => {
    try {
      const rates = await fetchForexRates(forexRef.current);
      if (Array.isArray(rates) && rates.length > 0) {
        setForexRates(rates);
        setForexSignals(generateForexSignals(rates));
        const isLive = rates.some((r) => r.isLive);
        setApiStatus((prev) => ({
          ...prev,
          forex: isLive ? 'LIVE' : 'FALLBACK',
        }));
      } else {
        setApiStatus((prev) => ({ ...prev, forex: 'FALLBACK' }));
      }
    } catch (err) {
      console.warn('Forex fetch failed:', err);
      setApiStatus((prev) => ({ ...prev, forex: 'OFFLINE' }));
    }
  }, []);

  const updateStocks = useCallback(async () => {
    try {
      const [thaiData, foreignData, indexData] = await Promise.allSettled([
        fetchThaiStockPrices(thaiRef.current),
        fetchForeignStockPrices(foreignRef.current),
        fetchStockIndices(indexRef.current),
      ]);

      let hasLive = false;
      if (thaiData.status === 'fulfilled' && thaiData.value) {
        setThaiStocks(thaiData.value);
        setThaiStockSignals(generateThaiStockSignals(thaiData.value));
        if (thaiData.value.some((s) => s.isLive)) hasLive = true;
      }
      if (foreignData.status === 'fulfilled' && foreignData.value) {
        setForeignStocks(foreignData.value);
        setForeignStockSignals(generateForeignStockSignals(foreignData.value));
        if (foreignData.value.some((s) => s.isLive)) hasLive = true;
      }
      if (indexData.status === 'fulfilled' && indexData.value && indexData.value.length > 0) {
        setStockIndices(indexData.value);
        if (indexData.value.some((s) => s.isLive)) hasLive = true;
      }

      setApiStatus((prev) => ({
        ...prev,
        stocks: hasLive ? 'LIVE' : 'FALLBACK',
      }));
    } catch (err) {
      console.warn('Stocks fetch failed:', err);
      setApiStatus((prev) => ({ ...prev, stocks: 'OFFLINE' }));
    }
  }, []);

  const updateNews = useCallback(async () => {
    try {
      const news = await fetchNews();
      setNewsList(news);
      const liveCount = news.filter((n) => !n.isCurated).length;
      setApiStatus((prev) => ({
        ...prev,
        news: liveCount > 0 ? 'LIVE' : news.length > 0 ? 'CURATED' : 'OFFLINE',
      }));
    } catch (err) {
      console.warn('News fetch failed:', err);
      setApiStatus((prev) => ({ ...prev, news: 'OFFLINE' }));
    }
  }, []);

  // Handler for manual re-test / refresh of all APIs
  const handleRefreshAllApis = useCallback(async () => {
    setApiStatus((prev) => ({ ...prev, isChecking: true }));
    const nowStr = new Date().toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const setMascotState = useMascotStore.getState().setMascotState;
    const resetMascot = useMascotStore.getState().resetToIdle;

    setMascotState('SCANNING');
    await Promise.allSettled([
      updateCryptoPrices(),
      updateForex(),
      updateStocks(),
      updateNews(),
    ]);

    setApiStatus((prev) => ({
      ...prev,
      isChecking: false,
      lastChecked: `${nowStr} ICT`,
    }));
    setTimeout(resetMascot, 2000);
  }, [updateCryptoPrices, updateForex, updateStocks, updateNews]);

  // 1. Binance WebSocket Connection with auto-reconnect & throttled batch update (1s max)
  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    const pendingUpdates = new Map<string, CryptoCoin>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushUpdates = () => {
      if (pendingUpdates.size === 0) return;
      const updates = new Map(pendingUpdates);
      pendingUpdates.clear();

      setCryptoList((prev) => {
        return prev.map((c) => {
          const u = updates.get(c.binanceSymbol.toLowerCase());
          if (!u) return c;
          const flash =
            u.price > c.price
              ? 'UP'
              : u.price < c.price
              ? 'DOWN'
              : 'NONE';
          return {
            ...c,
            price: u.price,
            change: u.change,
            high: u.high,
            low: u.low,
            volume: u.volume,
            flash,
          };
        });
      });
    };

    const connectWs = () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }

      wsRef.current = startBinanceWebSocket(
        (updatedCoin) => {
          pendingUpdates.set(updatedCoin.binanceSymbol.toLowerCase(), updatedCoin);
          if (!flushTimer) {
            flushTimer = setTimeout(() => {
              flushTimer = null;
              flushUpdates();
            }, 1000);
          }
        },
        (status) => {
          setApiStatus((prev) => ({ ...prev, binanceWs: status }));
          if (status === 'OFFLINE' || status === 'CLOSED') {
            // Immediately pull REST fallback prices so UI doesn't freeze
            updateCryptoPrices();
            reconnectAttempt += 1;
            // Exponential backoff capped at 30s: 5s, 10s, 20s, 30s, 30s, ...
            const delay = Math.min(5000 * Math.pow(2, reconnectAttempt - 1), 30000);
            reconnectTimeout = setTimeout(connectWs, delay);
          } else if (status === 'LIVE' || status === 'ONLINE') {
            reconnectAttempt = 0;
          }
        }
      );
    };

    connectWs();

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [updateCryptoPrices]);

  // 2. Crypto signals are derived from the live list (see `signals` below).
  //    Keeping a separate state here is what allowed SL/TP to drift away from
  //    the price shown on the card, so the 15s refresh loop is gone.

  // 3. Crypto REST Fallback Polling (immediate mount + every 30s)
  useEffect(() => {
    updateCryptoPrices();
    const interval = setInterval(() => {
      if (document.hidden) return;
      updateCryptoPrices();
    }, 30000);
    return () => clearInterval(interval);
  }, [updateCryptoPrices]);

  // 4. Forex Periodic Polling (immediate mount + every 15s)
  useEffect(() => {
    updateForex();
    const interval = setInterval(() => {
      if (document.hidden) return;
      updateForex();
    }, 15000);
    return () => clearInterval(interval);
  }, [updateForex]);

  // 5. Thai & Foreign Stock + Index Polling (immediate mount + every 60s)
  useEffect(() => {
    updateStocks();
    const interval = setInterval(() => {
      if (document.hidden) return;
      updateStocks();
    }, 60000);
    return () => clearInterval(interval);
  }, [updateStocks]);

  // 6. News Periodic Polling (immediate mount + every 300s)
  useEffect(() => {
    updateNews();
    const interval = setInterval(() => {
      if (document.hidden) return;
      updateNews();
    }, 300000);
    return () => clearInterval(interval);
  }, [updateNews]);

  // 6.5 Periodic background polling service to categorize global financial headlines into High/Medium/Low market impact using Gemini API
  useEffect(() => {
    if (newsList.length === 0) return;
    let isMounted = true;

    const runHeadlineCategorization = async () => {
      try {
        // read the freshest headlines: the effect only re-subscribes when the
        // *length* changes, so a captured `newsList` would re-send stale titles
        const currentNews = newsRef.current;
        if (currentNews.length === 0) return;
        const categorized = await categorizeHeadlinesWithGemini(currentNews, geminiApiKey);
        if (isMounted && Array.isArray(categorized) && categorized.length > 0) {
          setNewsList(categorized);
        }
      } catch (err) {
        console.warn('Headline impact background polling error:', err);
      }
    };

    runHeadlineCategorization();
    const interval = setInterval(() => {
      if (document.hidden) return;
      void runHeadlineCategorization();
    }, 600000); // Categorize headlines every 10 mins (free-tier friendly)
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [newsList.length, geminiApiKey]);

  // 7. Clock tick every 30s for Bangkok ICT Market Hours (ultra-low CPU)
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      setMarketHours(computeMarketHours());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Pre-computed Set for O(1) forex-pair membership lookup
  const forexPairSet = useMemo(
    () => new Set(forexRates.map((f) => f.pair)),
    [forexRates]
  );

  // Live USD/THB rate for THB display (fallback 36.45 when offline)
  const { rate: usdThbRate, isLive: usdThbLive } = useMemo(
    () => getLiveUsdThb(forexRates),
    [forexRates]
  );

  const atsActiveTab = useMascotFeed((s) => s.atsActiveTab);

  // Build real-time window & focus awareness context for Mascot AI across EVERY screen/modal
  const mascotWindowContext: MascotWindowContext = useMemo(() => {
    const openWindows: string[] = [];
    if (selectedSignal) openWindows.push(`SignalDetail:${selectedSignal.symbol}`);
    if (selectedForex) openWindows.push(`ForexDetail:${selectedForex.pair}`);
    if (selectedThaiStock) openWindows.push(`ThaiStockDetail:${selectedThaiStock.symbol}`);
    if (selectedForeignStock) openWindows.push(`ForeignStockDetail:${selectedForeignStock.symbol}`);
    if (showAtsMatrixModal) openWindows.push(atsActiveTab === 'BACKTEST' ? 'BacktestLab' : 'AtsMatrix');
    if (showChat) openWindows.push('ChatModal');
    if (showNewsModal) openWindows.push('NewsModal');
    if (showWatchlistModal) openWindows.push('WatchlistModal');
    if (showHistoryModal) openWindows.push('HistoryModal');
    if (showRiskCalc) openWindows.push('RiskCalculator');
    if (showDrawdownModal) openWindows.push('DrawdownMonitor');
    if (showSettings) openWindows.push('Settings');
    if (showGmail) openWindows.push('GmailModal');
    if (showCalendar) openWindows.push('CalendarModal');

    const tabLabels = ['คริปโต', 'ฟอเร็กซ์', 'หุ้นไทย SET', 'หุ้นต่างประเทศ US', 'ดัชนีตลาดโลก'];
    const activeTabLabel = tabLabels[selectedTab] || 'คริปโต';

    let activeSurface: MascotWindowSurface = 'DASHBOARD_CRYPTO';
    let windowTitleTh = `หน้าหลัก · ${activeTabLabel}`;
    let focusHint = 'ติดตามแนวโน้มราคา จุดรับ-ต้าน และสัญญาณเทรดหลัก';

    if (selectedSignal) {
      activeSurface = 'SIGNAL_DETAIL_MODAL';
      windowTitleTh = `รายละเอียดสัญญาณ · ${selectedSignal.symbol}`;
      focusHint = `โฟกัส Risk/Reward แผนเข้าเทรด จุด Stop Loss และ Take Profit ของ ${selectedSignal.symbol}`;
    } else if (selectedForex) {
      activeSurface = 'FOREX_DETAIL_MODAL';
      windowTitleTh = `รายละเอียดฟอเร็กซ์ · ${selectedForex.pair}`;
      focusHint = `โฟกัสอัตราดอกเบี้ย ข่าวเศรษฐกิจมหภาค และความผันผวนของคู่เงิน ${selectedForex.pair}`;
    } else if (selectedThaiStock || selectedForeignStock) {
      const sym = selectedThaiStock?.symbol || selectedForeignStock?.symbol || '';
      activeSurface = 'STOCK_DETAIL_MODAL';
      windowTitleTh = `วิเคราะห์หุ้นรายตัว · ${sym}`;
      focusHint = `โฟกัสพื้นฐาน งบดุล ปัจจัยเร่ง และจังหวะแนวรับ-แนวต้านของ ${sym}`;
    } else if (showAtsMatrixModal || isAtsMatrixMode) {
      if (atsActiveTab === 'BACKTEST') {
        activeSurface = 'ATS_BACKTEST_MODAL';
        windowTitleTh = 'ห้องทดสอบกลยุทธ์ย้อนหลัง (Backtest Lab)';
        focusHint = 'โฟกัส Win Rate, Sharpe Ratio, Max Drawdown และผลตอบแทนเทียบ Buy & Hold จากคลังข้อมูลย้อนหลัง 1,000 วัน';
      } else {
        activeSurface = 'ATS_MATRIX_MODAL';
        windowTitleTh = 'ATS Matrix & Niulai4 Cockpit';
        focusHint = 'โฟกัสสัญญาณ Order Flow ความเร็วสูง ความหนาแน่น Order Book และความผันผวนระยะสั้น';
      }
    } else if (showDrawdownModal) {
      activeSurface = 'DRAWDOWN_MODAL';
      windowTitleTh = 'ตรวจจับและคุมความเสี่ยง Drawdown';
      focusHint = 'โฟกัสการรักษาเงินต้น การตัดขาดทุนตามเกณฑ์ และระยะห่างจากจุดพีคสูงสุด';
    } else if (showRiskCalc) {
      activeSurface = 'RISK_CALC_MODAL';
      windowTitleTh = 'คำนวณความเสี่ยงและขนาด Position';
      focusHint = 'โฟกัสสัดส่วนความเสี่ยงต่อไม้ (% Risk/Trade), ระยะ Stop Loss และความคุ้มค่า Risk/Reward';
    } else if (showNewsModal) {
      activeSurface = 'NEWS_MODAL';
      windowTitleTh = 'ศูนย์ข่าวตลาด & วิเคราะห์ผลกระทบ';
      focusHint = 'โฟกัสข่าวระดับ High Impact และความอ่อนไหวของสินทรัพย์แต่ละประเภทต่อข่าวสำคัญ';
    } else if (showChat) {
      activeSurface = 'CHAT_MODAL';
      windowTitleTh = 'ห้องสนทนา AI Deep Analyze';
      focusHint = 'โฟกัสการวิเคราะห์เชิงลึก ข่าวสด และกลยุทธ์หลายกรอบเวลา';
    } else if (showWatchlistModal) {
      activeSurface = 'WATCHLIST_MODAL';
      windowTitleTh = 'รายการโปรด (Watchlist)';
      focusHint = 'โฟกัสสินทรัพย์ที่ผู้ใช้ติดตามเป็นพิเศษและการแจ้งเตือนราคา';
    } else if (showHistoryModal) {
      activeSurface = 'HISTORY_MODAL';
      windowTitleTh = 'ประวัติการวิเคราะห์ & สัญญาณที่บันทึก';
      focusHint = 'โฟกัสการทบทวนผลลัพธ์ย้อนหลังและบทเรียนจากแผนเดิม';
    } else if (showSettings) {
      activeSurface = 'SETTINGS_MODAL';
      windowTitleTh = 'ตั้งค่าระบบและจิตวิทยาการเทรด';
      focusHint = 'โฟกัสค่าความเสี่ยงรายวัน การแจ้งเตือนราคา สกุลเงิน และการตั้งค่า API';
    } else if (showGmail) {
      activeSurface = 'GMAIL_MODAL';
      windowTitleTh = 'แจ้งเตือนทางอีเมล (Gmail Alerts)';
      focusHint = 'โฟกัสการส่งสรุปสัญญาณและการตรวจสอบแจ้งเตือนทางอีเมล';
    } else if (showCalendar) {
      activeSurface = 'CALENDAR_MODAL';
      windowTitleTh = 'ปฏิทินเศรษฐกิจและนัดหมายเทรด';
      focusHint = 'โฟกัสเหตุการณ์เศรษฐกิจสำคัญที่กำลังจะประกาศ';
    } else {
      const surfaceByTab: MascotWindowSurface[] = [
        'DASHBOARD_CRYPTO',
        'DASHBOARD_FOREX',
        'DASHBOARD_THAI_STOCK',
        'DASHBOARD_FOREIGN_STOCK',
        'DASHBOARD_INDICES',
      ];
      activeSurface = surfaceByTab[selectedTab] || 'DASHBOARD_CRYPTO';
    }

    return {
      activeSurface,
      windowTitleTh,
      activeTabLabel,
      selectedAsset: selectedChartAsset,
      openWindows,
      focusHint,
    };
  }, [
    selectedTab,
    selectedChartAsset,
    atsActiveTab,
    isAtsMatrixMode,
    showAtsMatrixModal,
    showChat,
    showNewsModal,
    showWatchlistModal,
    showHistoryModal,
    showSettings,
    showRiskCalc,
    showDrawdownModal,
    showGmail,
    showCalendar,
    selectedSignal,
    selectedForex,
    selectedThaiStock,
    selectedForeignStock,
  ]);

  // Mascot: the dashboard only publishes what it knows; the mascot decides what
  // to do about it (see mascot/feed.ts + mascot/observer.ts).
  useEffect(() => {
    publishMascotFeed({
      cryptoList,
      signals,
      useThb,
      usdThbRate,
      apiKey: geminiApiKey,
      drawdownBreaches: criticalOrExtremeAssets.length,
      worstDrawdownPct: portfolioDrawdownSummary.worstDrawdownPct,
      windowContext: mascotWindowContext,
    });
  }, [
    cryptoList,
    signals,
    useThb,
    usdThbRate,
    geminiApiKey,
    criticalOrExtremeAssets.length,
    portfolioDrawdownSummary.worstDrawdownPct,
    mascotWindowContext,
  ]);


  /** One door to the chat: the mascot and the header both come through here. */
  const openChat = useCallback((question?: string) => {
    setChatSeed(question?.trim() ?? '');
    setShowChat(true);
  }, []);

  // Live action refs so dynamically registered Mascot capabilities never hit stale closures
  const actionDataRef = useRef({
    signals,
    forexSignals,
    forexRates,
    thaiStocks,
    foreignStocks,
    stockIndices,
    cryptoList,
    useThb,
    notificationsEnabled,
    isAtsMatrixMode,
    handleToggleWatchlist: (_sym: string) => {},
    handleSetAlert: (_sym: string, _price: number) => {},
    handleToggleCurrency: (_val: boolean) => {},
    handleToggleNotifications: () => {},
    handleRefreshAllApis: () => Promise.resolve(),
  });

  // The mascot may navigate, filter, switch panels and invoke any safe sandbox feature dynamically — never trade.
  useEffect(() => {
    const tabForMarket = (market?: MascotMarket): number | null => {
      switch (market) {
        case 'crypto':
          return 0;
        case 'forex':
          return 1;
        case 'th':
          return 2;
        case 'us':
          return 3;
        case 'index':
          return 4;
        default:
          return null;
      }
    };

    const resolveChartSelection = (rawSymbol: string, marketHint?: MascotMarket) => {
      const q = rawSymbol.trim().toUpperCase();
      const data = actionDataRef.current;

      const coin = data.cryptoList.find(
        (c) => c.symbol.toUpperCase() === q || c.id.toUpperCase() === q || c.binanceSymbol.toUpperCase() === `${q}USDT`
      );
      if (coin && (!marketHint || marketHint === 'crypto')) {
        setSelectedTab(0);
        setSelectedChartAsset(coin.id);
        return true;
      }

      const fx = data.forexRates.find(
        (f) => f.pair.toUpperCase() === q || f.pair.replace('/', '').toUpperCase() === q
      );
      if (fx && (!marketHint || marketHint === 'forex')) {
        setSelectedTab(1);
        setSelectedChartAsset(fx.pair);
        return true;
      }

      const th = data.thaiStocks.find((s) => s.symbol.toUpperCase() === q);
      if (th && (!marketHint || marketHint === 'th')) {
        setSelectedTab(2);
        setSelectedChartAsset(th.symbol);
        return true;
      }

      const us = data.foreignStocks.find((s) => s.symbol.toUpperCase() === q);
      if (us && (!marketHint || marketHint === 'us')) {
        setSelectedTab(3);
        setSelectedChartAsset(us.symbol);
        return true;
      }

      const idx = data.stockIndices.find(
        (s) => s.symbol.toUpperCase() === q || s.name.toUpperCase().includes(q)
      );
      if (idx && (!marketHint || marketHint === 'index')) {
        setSelectedTab(4);
        setSelectedChartAsset(idx.symbol);
        return true;
      }

      const tab = tabForMarket(marketHint);
      if (tab !== null) setSelectedTab(tab);
      setSelectedChartAsset(rawSymbol.trim());
      return true;
    };

    const openDetailForSymbol = (rawSymbol: string, marketHint?: MascotMarket) => {
      const q = rawSymbol.trim().toUpperCase();
      const data = actionDataRef.current;

      const sig = data.signals.find(
        (s) => s.symbol.toUpperCase() === q || s.base.toUpperCase() === q
      );
      if (sig && (!marketHint || marketHint === 'crypto')) {
        setSelectedTab(0);
        setSelectedSignal(sig);
        return;
      }

      const fx = data.forexRates.find(
        (f) => f.pair.toUpperCase() === q || f.pair.replace('/', '').toUpperCase() === q
      );
      if (fx && (!marketHint || marketHint === 'forex')) {
        setSelectedTab(1);
        setSelectedForex(fx);
        return;
      }

      const th = data.thaiStocks.find((s) => s.symbol.toUpperCase() === q);
      if (th && (!marketHint || marketHint === 'th')) {
        setSelectedTab(2);
        setSelectedThaiStock(th);
        return;
      }

      const us = data.foreignStocks.find((s) => s.symbol.toUpperCase() === q);
      if (us && (!marketHint || marketHint === 'us')) {
        setSelectedTab(3);
        setSelectedForeignStock(us);
        return;
      }

      // Fallback: filter to the symbol
      const tab = tabForMarket(marketHint);
      if (tab !== null) setSelectedTab(tab);
      setSearchQuery(rawSymbol.trim());
    };

    const closeSpecificOrAll = (target?: string) => {
      if (!target || target === 'all') {
        setShowNewsModal(false);
        setShowWatchlistModal(false);
        setShowHistoryModal(false);
        setShowAtsMatrixModal(false);
        setShowSettings(false);
        setShowGmail(false);
        setShowCalendar(false);
        setShowChat(false);
        setShowRiskCalc(false);
        setShowDrawdownModal(false);
        setSelectedSignal(null);
        setSelectedForex(null);
        setSelectedThaiStock(null);
        setSelectedForeignStock(null);
        return;
      }
      switch (target) {
        case 'news':
          setShowNewsModal(false);
          break;
        case 'chat':
          setShowChat(false);
          break;
        case 'watchlist':
          setShowWatchlistModal(false);
          break;
        case 'history':
          setShowHistoryModal(false);
          break;
        case 'settings':
          setShowSettings(false);
          break;
        case 'risk_calc':
          setShowRiskCalc(false);
          break;
        case 'drawdown':
          setShowDrawdownModal(false);
          break;
        case 'ats_matrix':
        case 'backtest':
          setShowAtsMatrixModal(false);
          break;
        case 'gmail':
          setShowGmail(false);
          break;
        case 'calendar':
          setShowCalendar(false);
          break;
        case 'detail':
          setSelectedSignal(null);
          setSelectedForex(null);
          setSelectedThaiStock(null);
          setSelectedForeignStock(null);
          break;
      }
    };

    return registerMascotActionHandlers({
      change_asset: (action) => {
        if (action.name !== 'change_asset') return;
        const tab = tabForMarket(action.market);
        if (tab !== null) setSelectedTab(tab);
        setSearchQuery(action.symbol);
        resolveChartSelection(action.symbol, action.market);
      },
      filter_stocks: (action) => {
        if (action.name !== 'filter_stocks') return;
        const tab = tabForMarket(action.market);
        if (tab !== null) setSelectedTab(tab);
        setSearchQuery(action.query);
      },
      open_news: () => setShowNewsModal(true),
      open_chat: (action) => {
        if (action.name !== 'open_chat') return;
        openChat(action.question);
      },
      open_window: (action) => {
        if (action.name !== 'open_window') return;
        switch (action.window) {
          case 'news':
            setShowNewsModal(true);
            break;
          case 'chat':
            openChat();
            break;
          case 'watchlist':
            setShowWatchlistModal(true);
            break;
          case 'history':
            setShowHistoryModal(true);
            break;
          case 'settings':
            setShowSettings(true);
            break;
          case 'risk_calc':
            setShowRiskCalc(true);
            break;
          case 'drawdown':
            setShowDrawdownModal(true);
            break;
          case 'ats_matrix':
            requestAtsDashboardTab('LIVE_MATRIX');
            setShowAtsMatrixModal(true);
            break;
          case 'backtest':
            requestAtsDashboardTab('BACKTEST');
            setShowAtsMatrixModal(true);
            break;
          case 'gmail':
            setShowGmail(true);
            break;
          case 'calendar':
            setShowCalendar(true);
            break;
        }
      },
      close_window: (action) => {
        if (action.name !== 'close_window') return;
        closeSpecificOrAll(action.window);
      },
      switch_market_tab: (action) => {
        if (action.name !== 'switch_market_tab') return;
        const tab = tabForMarket(action.market);
        if (tab !== null) setSelectedTab(tab);
      },
      select_chart_asset: (action) => {
        if (action.name !== 'select_chart_asset') return;
        resolveChartSelection(action.symbol, action.market);
      },
      inspect_asset: (action) => {
        if (action.name !== 'inspect_asset') return;
        openDetailForSymbol(action.symbol, action.market);
      },
      toggle_currency: (action) => {
        if (action.name !== 'toggle_currency') return;
        const targetThb =
          action.currency === 'THB'
            ? true
            : action.currency === 'USD'
              ? false
              : !actionDataRef.current.useThb;
        actionDataRef.current.handleToggleCurrency(targetThb);
      },
      toggle_notifications: (action) => {
        if (action.name !== 'toggle_notifications') return;
        if (
          typeof action.enabled === 'boolean' &&
          action.enabled === actionDataRef.current.notificationsEnabled
        ) {
          return;
        }
        actionDataRef.current.handleToggleNotifications();
      },
      toggle_watchlist: (action) => {
        if (action.name !== 'toggle_watchlist') return;
        actionDataRef.current.handleToggleWatchlist(action.symbol);
      },
      set_price_alert: (action) => {
        if (action.name !== 'set_price_alert') return;
        actionDataRef.current.handleSetAlert(action.symbol, action.targetPrice);
      },
      refresh_market_data: () => {
        void actionDataRef.current.handleRefreshAllApis();
      },
      toggle_ats_inline: (action) => {
        if (action.name !== 'toggle_ats_inline') return;
        setIsAtsMatrixMode((prev) =>
          typeof action.enabled === 'boolean' ? action.enabled : !prev
        );
      },
      clear_filters: () => {
        setSearchQuery('');
      },
      sync_drive_archive: () => {
        const token = getCachedAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        void fetch('/api/archive/daily/run', {
          method: 'POST',
          headers,
          body: JSON.stringify({ force: false }),
        })
          .then(() =>
            fetch('/api/archive/drive/sync', {
              method: 'POST',
              headers,
            })
          )
          .catch(() => {});
      },
      export_daily_csv: (action) => {
        if (action.name !== 'export_daily_csv') return;
        if (action.destination === 'drive') {
          void exportDailyCsvToDriveFolder({
            dateKey: action.dateKey,
            dataset: action.dataset || 'all',
          }).catch(() => {});
          return;
        }
        void downloadDailyCsvExport({
          dateKey: action.dateKey,
          dataset: action.dataset || 'combined',
        }).catch(() => {});
      },
    });
  }, [openChat]);

  // Publish the same rate to the formatters so every ฿ amount on screen —
  // ticker, cards, detail modals, history — converts with one number.
  useEffect(() => {
    setActiveUsdThbRate(usdThbRate);
  }, [usdThbRate]);

  // All tradeable signals for the risk calculator picker
  const allSignals = useMemo(
    () => [...signals, ...forexSignals, ...thaiStockSignals, ...foreignStockSignals],
    [signals, forexSignals, thaiStockSignals, foreignStockSignals]
  );

  // 7. Load Chart Data for Selected Asset
  // `isForexChart` is a primitive on purpose: depending on the Set itself made
  // the chart refetch every time forex rates ticked (every 15s).
  const isForexChart = forexPairSet.has(selectedChartAsset);
  useEffect(() => {
    let isCancelled = false;
    setChartLoading(true);

    fetchPriceHistory(selectedChartAsset, isForexChart)
      .then((data) => {
        if (!isCancelled) setChartData(data);
      })
      .catch((err: unknown) => {
        // A failed candle request used to leave the spinner running forever and
        // surface as an unhandled promise rejection.
        if (isCancelled) return;
        console.warn('Chart data request failed:', err);
        setChartData(null);
      })
      .finally(() => {
        if (!isCancelled) setChartLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedChartAsset, isForexChart]);

  // Helper: show toast, auto-clear after 5s, and remove the triggered alert.
  // Memoised so the price-alert effect dependency is stable.
  const triggerPriceAlert = useCallback(
    (symbol: string, targetPrice: number, currentPrice: number) => {
      const multiplier = useThb ? usdThbRate : 1;
      const currency = useThb ? '฿' : '$';
      const fmt = (n: number) =>
        `${currency}${n.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      setAlertToast(
        t('trading.price_alert_toast', {
          symbol,
          price: fmt(targetPrice * multiplier),
          current: fmt(currentPrice * multiplier),
        })
      );
      useMascotStore.getState().setMascotState('TP_CELEBRATE');
      setPriceAlerts((prev) =>
        prev.filter(
          (a) => !(a.symbol === symbol && a.targetPrice === targetPrice)
        )
      );
      // Auto-clear the toast after 5 seconds
      setTimeout(() => setAlertToast(null), 5000);
    },
    [useThb, usdThbRate]
  );

  // 8. Check Price Alerts (supports crypto, forex, indices, Thai stocks, and foreign stocks)
  useEffect(() => {
    if (!notificationsEnabled || priceAlerts.length === 0) return;

    priceAlerts.forEach((alert) => {
      // Check crypto
      const coin = cryptoList.find((c) => c.symbol === alert.symbol);
      if (coin && coin.price >= alert.targetPrice) {
        triggerPriceAlert(alert.symbol, alert.targetPrice, coin.price);
        return;
      }

      // Check forex
      const fx = forexRates.find((f) => f.pair === alert.symbol);
      if (fx && fx.price >= alert.targetPrice) {
        triggerPriceAlert(alert.symbol, alert.targetPrice, fx.price);
        return;
      }

      // Check stock indices
      const stock = stockIndices.find((s) => s.symbol === alert.symbol);
      if (stock && stock.price >= alert.targetPrice) {
        triggerPriceAlert(alert.symbol, alert.targetPrice, stock.price);
        return;
      }

      // Check Thai stocks
      const thai = thaiStocks.find((t) => t.symbol === alert.symbol);
      if (thai && thai.price >= alert.targetPrice) {
        triggerPriceAlert(alert.symbol, alert.targetPrice, thai.price);
        return;
      }

      // Check Foreign stocks
      const foreign = foreignStocks.find((f) => f.symbol === alert.symbol);
      if (foreign && foreign.price >= alert.targetPrice) {
        triggerPriceAlert(alert.symbol, alert.targetPrice, foreign.price);
      }
    });
  }, [
    cryptoList,
    forexRates,
    stockIndices,
    thaiStocks,
    foreignStocks,
    priceAlerts,
    notificationsEnabled,
    triggerPriceAlert,
  ]);

  // Handlers with Firestore Cloud Sync
  const handleToggleWatchlist = (symbol: string) => {
    const wasWatched = watchlist.has(symbol);
    announceMascot(
      wasWatched ? `เอาออก ${symbol} แล้วครับ` : `เพิ่ม ${symbol} เข้า watchlist ให้แล้วครับ`
    );
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      const targetUid = user?.uid || 'local';
      saveUserSettings(targetUid, { watchlist: Array.from(next) }).catch((err) =>
        console.error('Failed to sync watchlist:', err)
      );
      return next;
    });
  };

  const handleSetAlert = (symbol: string, targetPrice: number) => {
    const nextAlerts = [...priceAlerts, { symbol, targetPrice }];
    setPriceAlerts(nextAlerts);
    const targetUid = user?.uid || 'local';
    saveUserSettings(targetUid, { priceAlerts: nextAlerts }).catch((err) =>
      console.error('Failed to sync alerts:', err)
    );
    addHistoryEntry(targetUid, {
      type: 'PRICE_ALERT',
      symbol,
      action: 'ALERT',
      price: targetPrice,
      aiSummary: `ตั้งแจ้งเตือนราคาเป้าหมาย ${symbol} ที่ $${targetPrice.toLocaleString()}`,
    }).catch((err) => console.error('Failed to record alert history:', err));
  };

  const handleRemoveAlert = (symbol: string, targetPrice: number) => {
    const nextAlerts = priceAlerts.filter(
      (a) => !(a.symbol === symbol && a.targetPrice === targetPrice)
    );
    setPriceAlerts(nextAlerts);
    const targetUid = user?.uid || 'local';
    saveUserSettings(targetUid, { priceAlerts: nextAlerts }).catch((err) =>
      console.error('Failed to sync alerts removal:', err)
    );
  };

  const handleSaveApiKey = async (newKey: string) => {
    // ตัดช่องว่างหัว-ท้ายเสมอ: คีย์ที่Copyมามักติดขึ้นบรรทัดใหม่ แล้วจะถูก Google ปฏิเสธ
    const normalized = newKey.trim();
    setGeminiApiKey(normalized);
    const targetUid = user?.uid || 'local';
    await saveUserSettings(targetUid, { geminiApiKey: normalized });
  };

  const handleToggleCurrency = (val: boolean) => {
    setUseThb(val);
    const targetUid = user?.uid || 'local';
    saveUserSettings(targetUid, { useThb: val }).catch((err) =>
      console.error('Failed to sync useThb setting:', err)
    );
  };

  const handleToggleNotifications = () => {
    const nextVal = !notificationsEnabled;
    setNotificationsEnabled(nextVal);
    const targetUid = user?.uid || 'local';
    saveUserSettings(targetUid, { notificationsEnabled: nextVal }).catch((err) =>
      console.error('Failed to sync notifications setting:', err)
    );
  };

  actionDataRef.current = {
    signals,
    forexSignals,
    forexRates,
    thaiStocks,
    foreignStocks,
    stockIndices,
    cryptoList,
    useThb,
    notificationsEnabled,
    isAtsMatrixMode,
    handleToggleWatchlist,
    handleSetAlert,
    handleToggleCurrency,
    handleToggleNotifications,
    handleRefreshAllApis,
  };

  const handleSavePsychologySettings = async (settings: TradingPsychologySettings) => {
    setPsychologySettings(settings);
    const targetUid = user?.uid || 'local';
    await saveUserSettings(targetUid, { psychologySettings: settings });
  };

  const handleSaveToHistory = async (
    entry: Omit<TradingHistoryEntry, 'id' | 'userId' | 'timestamp'>
  ) => {
    const targetUid = user?.uid || 'local';
    await addHistoryEntry(targetUid, entry);
  };

  const handleDeleteHistoryEntry = async (id: string) => {
    const targetUid = user?.uid || 'local';
    await deleteHistoryEntry(targetUid, id);
  };

  const handleClearAllHistory = async () => {
    const targetUid = user?.uid || 'local';
    await clearAllUserHistory(targetUid);
  };

  // Filtered lists
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      const matchesSearch =
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.base.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [signals, searchQuery]);
  
  const filteredWatchThaiStocks = useMemo(
    () =>
      thaiStocks.filter(
        (s) =>
          watchlist.has(s.symbol) &&
          (s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [thaiStocks, watchlist, searchQuery]
  );

  const filteredWatchForeignStocks = useMemo(
    () =>
      foreignStocks.filter(
        (s) =>
          watchlist.has(s.symbol) &&
          (s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [foreignStocks, watchlist, searchQuery]
  );

  const watchlistCryptoSignals = useMemo(() => {
    return signals.filter((s) => {
      const matchesSearch =
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.base.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch && watchlist.has(s.symbol);
    });
  }, [signals, searchQuery, watchlist]);

  const watchlistForexSignals = useMemo(() => {
    return forexSignals.filter((s) => {
      const matchesSearch =
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.base.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch && watchlist.has(s.symbol);
    });
  }, [forexSignals, searchQuery, watchlist]);

  const tabs = [
    { label: t('common.crypto'), count: signals.length },
    { label: t('common.forex'), count: forexRates.length },
    { label: t('common.thai_stocks'), count: thaiStocks.length },
    { label: t('common.foreign_stocks'), count: foreignStocks.length },
    { label: t('common.indices'), count: stockIndices.length },
  ];

  return (
    <>

    <div
      className={`min-h-screen ${
        isDark ? 'bg-[#0F1117] text-[#ECEAF4]' : 'bg-[#F8FAFC] text-[#0F172A]'
      } flex flex-col font-sans transition-colors duration-200 overflow-x-hidden w-full max-w-[100vw]`}
    >
      {/* Toast Notification */}
      {alertToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 left-4 sm:left-auto z-[60] sm:max-w-sm bg-[#7C6CFF] text-[#0F1117] px-4 py-3 rounded-2xl shadow-xl border border-white/20 flex items-center justify-between space-x-3 animate-fade-in"
        >
          <span className="text-xs font-semibold">{alertToast}</span>
          <button
            type="button"
            onClick={() => setAlertToast(null)}
            aria-label="ปิดการแจ้งเตือน"
            className="text-white/80 hover:text-white text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <Header
        cryptoList={cryptoList}
        useThb={useThb}
        usdThbRate={usdThbRate}
        usdThbLive={usdThbLive}
        isDark={isDark}
        notifEnabled={notificationsEnabled}
        alertCount={priceAlerts.length}
        user={user}
        onToggleCurrency={() => setUseThb(!useThb)}
        onToggleNotifications={() =>
          setNotificationsEnabled(!notificationsEnabled)
        }
        onOpenSettings={() => setShowSettings(true)}
        onOpenGmail={() => setShowGmail(true)}
        onOpenCalendar={() => setShowCalendar(true)}
        onOpenChat={() => openChat()}
        onOpenRiskCalc={() => setShowRiskCalc(true)}
        onOpenDrawdown={() => setShowDrawdownModal(true)}
        onOpenAtsMatrix={() => setShowAtsMatrixModal(true)}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
        drawdownBreachCount={breachedDrawdownAssets.length}
      />

          {/* Drawdown Visual Alert Banner */}
          {!drawdownDismissed && criticalOrExtremeAssets.length > 0 && (
            <DrawdownAlertBanner
              summary={portfolioDrawdownSummary}
              breachedAssets={criticalOrExtremeAssets}
              onOpenMonitor={() => setShowDrawdownModal(true)}
              onDismiss={() => setDrawdownDismissed(true)}
              soundEnabled={drawdownThresholds.soundEnabled}
              onToggleSound={() => {
                const next = { ...drawdownThresholds, soundEnabled: !drawdownThresholds.soundEnabled };
                setDrawdownThresholds(next);
                saveThresholds(next);
              }}
            />
          )}

          {/* Main Container */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 overflow-x-hidden">
            {/* 2-Column Responsive Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Main Column: Chart + Asset Tabs & Cards (col-span-8) */}
              <div className="lg:col-span-8 space-y-6">
                {/* Asset Tabs & Filter — Floating Action Sidebar Style Bar */}
                <div className="space-y-4">
                  <div className="rounded-[20px] bg-[#141725] border border-white/[0.07] p-3 shadow-lg">
                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                      {/* Tabs / Filters */}
                      <div className="flex items-center space-x-1 bg-[#0F1117] p-1 rounded-xl border border-white/[0.07] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] max-w-full">
                        {tabs.map((tab, idx) => (
                          <button
                            key={tab.label}
                            type="button"
                            onClick={() => {
                              setSelectedTab(idx);
                              if (idx === 0) setSelectedChartAsset(cryptoList[0]?.id || 'bitcoin');
                              else if (idx === 1) setSelectedChartAsset(forexRates[0]?.pair || 'EUR/USD');
                              else if (idx === 2) setSelectedChartAsset(thaiStocks[0]?.symbol || 'AOT');
                              else if (idx === 3) setSelectedChartAsset(foreignStocks[0]?.symbol || 'AAPL');
                              else if (idx === 4) setSelectedChartAsset(stockIndices[0]?.symbol || 'SET');
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 shrink-0 ${
                              selectedTab === idx
                                ? 'bg-[#7C6CFF] text-[#0F1117] font-bold shadow-xs'
                                : 'text-[#A7A4B8] hover:text-white'
                            }`}
                          >
                            <span>{tab.label}</span>
                            {tab.count > 0 && (
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                  selectedTab === idx
                                    ? 'bg-black/30 text-white'
                                    : 'bg-[#222640] text-[#A89FFF]'
                                }`}
                              >
                                {tab.count}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Right Action Group: Search Bar + News & AI Hub Button */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 sm:flex-initial">
                          <Search className="w-4 h-4 text-[#A7A4B8] absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="ค้นหาสินทรัพย์..."
                            className="w-full sm:w-44 bg-[#0F1117] border border-white/[0.07] focus:border-[#7C6CFF] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#ECEAF4] outline-none placeholder-[#A7A4B8]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowWatchlistModal(true)}
                          className="px-3 py-1.5 bg-[#7C6CFF]/15 hover:bg-[#7C6CFF]/25 border border-[#7C6CFF]/30 text-[#7C6CFF] rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shrink-0"
                          title="เปิดหน้าต่าง Watchlist (รายการโปรด)"
                        >
                          <Star className="w-3.5 h-3.5 text-[#7C6CFF] fill-[#7C6CFF]" />
                          <span className="hidden sm:inline">Watchlist</span>
                          {[
                            ...signals.map((s) => s.symbol),
                            ...forexSignals.map((s) => s.symbol),
                            ...thaiStocks.map((s) => s.symbol),
                            ...foreignStocks.map((s) => s.symbol),
                          ].filter((sym) => watchlist.has(sym)).length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#7C6CFF] text-[#0F1117]">
                              {[
                                ...signals.map((s) => s.symbol),
                                ...forexSignals.map((s) => s.symbol),
                                ...thaiStocks.map((s) => s.symbol),
                                ...foreignStocks.map((s) => s.symbol),
                              ].filter((sym) => watchlist.has(sym)).length}
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowHistoryModal(true)}
                          className="px-3 py-1.5 bg-[#7EE0B5]/15 hover:bg-[#7EE0B5]/25 border border-[#7EE0B5]/30 text-[#7EE0B5] rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shrink-0"
                          title="เปิดหน้าต่างประวัติการวิเคราะห์"
                        >
                          <History className="w-3.5 h-3.5 text-[#7EE0B5]" />
                          <span className="hidden sm:inline">ประวัติ</span>
                          {historyEntries.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#7EE0B5] text-[#0F1117]">
                              {historyEntries.length}
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowNewsModal(true)}
                          className="px-3 py-1.5 bg-[#4CC9F0]/15 hover:bg-[#4CC9F0]/25 border border-[#4CC9F0]/30 text-[#4CC9F0] rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shrink-0"
                          title="เปิดหน้าต่างข่าวสาร & วิเคราะห์ AI"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">ข่าว & วิเคราะห์ AI</span>
                        </button>

                        {/* ATS Matrix Mode Button */}
                        <button
                          type="button"
                          onClick={() => setShowAtsMatrixModal(true)}
                          className="px-3 py-1.5 bg-[#7EE0B5]/15 hover:bg-[#7EE0B5]/25 border border-[#7EE0B5]/40 text-[#7EE0B5] rounded-xl text-xs font-mono font-bold inline-flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                          title="เปิดโหมด ATS MATRIX (Polymarket & Crypto Arbitrage)"
                        >
                          <Radio className="w-3.5 h-3.5 text-[#7EE0B5]" />
                          <span className="hidden sm:inline">ATS Matrix</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#7EE0B5] text-black font-extrabold">
                            LIVE
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Auto-detected ATS MATRIX Trigger Banner */}
                    {isAtsMatrixTrigger(searchQuery) && (
                      <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-[#7EE0B5]/20 via-[#141725] to-[#4CC9F0]/20 border border-[#7EE0B5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(0,255,102,0.15)] animate-in fade-in duration-300">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#7EE0B5]/20 border border-[#7EE0B5]/50 flex items-center justify-center text-[#7EE0B5] shrink-0 animate-pulse">
                            <Radio className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-mono font-black text-white flex items-center gap-2">
                              <span>⚡ สลับเป็น ATS MATRIX MODE (MARKETS / BTC / POLYMARKET)</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-[#7EE0B5] text-black font-extrabold">
                                AUTO-DETECTED
                              </span>
                            </div>
                            <p className="text-[11px] font-mono text-[#ECEAF4] mt-0.5">
                              ตรวจพบคำค้นหาเกี่ยวข้อง — เปิดวิเคราะห์ Torus Model, Feed Latency, Inefficiency และทำนาย 1M/15M/1H
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setIsAtsMatrixMode(true);
                              setShowAtsMatrixModal(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#7EE0B5] hover:bg-[#7EE0B5]/90 text-black text-xs font-mono font-black transition-all shadow-[0_0_12px_rgba(0,255,102,0.3)] cursor-pointer"
                          >
                            เปิด Cockpit ทันที
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsAtsMatrixMode((v) => !v)}
                            className="px-3 py-1.5 rounded-lg bg-[#222640] hover:bg-[#222640] text-[#ECEAF4] text-xs font-mono font-bold transition-all border border-white/[0.07] cursor-pointer"
                          >
                            {isAtsMatrixMode ? 'ซ่อนในแดชบอร์ด' : 'แสดงในแดชบอร์ด'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline ATS Matrix Mode Cockpit */}
                {isAtsMatrixMode && (
                  <AtsMatrixDashboard
                    cryptoList={cryptoList}
                    isDark={isDark}
                    onClose={() => setIsAtsMatrixMode(false)}
                    onSendToChat={handleSendAtsToChat}
                  />
                )}

                {/* Real Price Chart Canvas with Asset Selector */}
                <div className="rounded-[20px] bg-[#141725] border border-white/[0.07] p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-white/[0.07]/60 gap-2">
                    <div>
                      <h2 className="text-white font-bold text-sm">
                        กราฟราคา 1,000 วัน & ค่าเฉลี่ย EMA (20/50)
                      </h2>
                      <p className="text-[#A7A4B8] text-[11px] mt-0.5">
                        {/* ไม่ยืนยันว่าเป็นข้อมูลสดตรงนี้ — ให้ป้ายบนกราฟเป็นผู้บอกสถานะจริง/สำรอง
                            (เดิมบรรทัดนี้เขียนว่า "ดึงข้อมูลจริง" ขณะที่ป้ายบนกราฟขึ้น "ออฟไลน์") */}
                        {selectedTab === 0 && 'Binance 1D Klines 1,000 วัน · EMA (20/50) · แนวรับ-แนวต้าน — สถานะข้อมูลดูที่ป้ายบนกราฟ'}
                        {selectedTab === 1 && 'Forex 1D Closes · กรอบสวิง — สถานะข้อมูลดูที่ป้ายบนกราฟ'}
                        {selectedTab === 2 && 'หุ้นไทย SET (.BK) รายวัน · แนวรับ-แนวต้าน — สถานะข้อมูลดูที่ป้ายบนกราฟ'}
                        {selectedTab === 3 && 'หุ้นสหรัฐฯ (US Equities) รายวัน · EMA — สถานะข้อมูลดูที่ป้ายบนกราฟ'}
                        {selectedTab === 4 && 'ดัชนีตลาด (SET, NASDAQ, S&P 500, DJI) 1,000 วัน — สถานะข้อมูลดูที่ป้ายบนกราฟ'}
                      </p>
                    </div>

                    {/* Dynamic asset selector based on active tab */}
                    <div className="flex items-center space-x-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] max-w-full">
                      {selectedTab === 0 && cryptoList.map((coin) => (
                        <button
                          key={coin.id}
                          type="button"
                          onClick={() => setSelectedChartAsset(coin.id)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 whitespace-nowrap ${
                            selectedChartAsset === coin.id
                              ? 'bg-[#7C6CFF] text-[#0F1117] shadow-xs'
                              : 'bg-[#0F1117] text-[#A7A4B8] hover:text-white border border-white/[0.07]'
                          }`}
                        >
                          {coin.symbol}
                        </button>
                      ))}
                      {selectedTab === 1 && forexRates.map((forex) => (
                        <button
                          key={forex.pair}
                          type="button"
                          onClick={() => setSelectedChartAsset(forex.pair)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 whitespace-nowrap ${
                            selectedChartAsset === forex.pair
                              ? 'bg-[#7EE0B5] text-[#0F1117] shadow-xs'
                              : 'bg-[#0F1117] text-[#A7A4B8] hover:text-white border border-white/[0.07]'
                          }`}
                        >
                          {forex.pair}
                        </button>
                      ))}
                      {selectedTab === 2 && thaiStocks.map((stock) => (
                        <button
                          key={stock.symbol}
                          type="button"
                          onClick={() => setSelectedChartAsset(stock.symbol)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 whitespace-nowrap ${
                            selectedChartAsset === stock.symbol
                              ? 'bg-[#FFB86B] text-black shadow-xs font-black'
                              : 'bg-[#0F1117] text-[#A7A4B8] hover:text-white border border-white/[0.07]'
                          }`}
                        >
                          {stock.symbol}
                        </button>
                      ))}
                      {selectedTab === 3 && foreignStocks.map((stock) => (
                        <button
                          key={stock.symbol}
                          type="button"
                          onClick={() => setSelectedChartAsset(stock.symbol)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 whitespace-nowrap ${
                            selectedChartAsset === stock.symbol
                              ? 'bg-[#4CC9F0] text-black shadow-xs font-black'
                              : 'bg-[#0F1117] text-[#A7A4B8] hover:text-white border border-white/[0.07]'
                          }`}
                        >
                          {stock.symbol}
                        </button>
                      ))}
                      {selectedTab === 4 && stockIndices.map((idxItem) => (
                        <button
                          key={idxItem.symbol}
                          type="button"
                          onClick={() => setSelectedChartAsset(idxItem.symbol)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 whitespace-nowrap ${
                            selectedChartAsset === idxItem.symbol
                              ? 'bg-[#A89FFF] text-[#0F1117] shadow-xs'
                              : 'bg-[#0F1117] text-[#A7A4B8] hover:text-white border border-white/[0.07]'
                          }`}
                        >
                          {idxItem.symbol}
                        </button>
                      ))}
                    </div>
                  </div>

                  <PriceChartCanvas
                    chartData={chartData}
                    isLoading={chartLoading}
                    assetSymbol={selectedChartAsset}
                    useThb={useThb}
                    usdThbRate={usdThbRate}
                  />
                </div>

                {/* Asset Tabs & Filter — Floating Action Sidebar Style Bar */}
                <div className="space-y-4">
                  {selectedTab >= 2 && (
                    /* ตัวเลขคงที่ (หุ้น/ดัชนี) ต้องมีป้ายบอกเวลาอ้างอิงเสมอ */
                    <p className="text-[10px] text-[#8E8BA3] flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded border bg-[#FFB86B]/15 border-[#FFB86B]/40 text-[#FFB86B]">
                        ○ STALE
                      </span>
                      = ราคาอ้างอิง ณ เวลาที่ระบุบนการ์ด ไม่ใช่ราคาสด — ระบบไม่แต่งตัวเลขขึ้นเอง
                    </p>
                  )}
                  {/* Asset List Content */}
                  {selectedTab === 0 && (
                    <div className="space-y-3">
                      {filteredSignals.map((sig) => {
                        const coin = cryptoList.find((c) => c.symbol === sig.symbol);
                        return (
                          <CryptoCard
                            key={sig.id}
                            signal={sig}
                            coin={coin}
                            isWatchlisted={watchlist.has(sig.symbol)}
                            useThb={useThb}
                            usdThbRate={usdThbRate}
                            onToggleWatchlist={handleToggleWatchlist}
                            onSelect={() => setSelectedSignal(sig)}
                          />
                        );
                      })}
                    </div>
                  )}

                  {selectedTab === 1 && (
                    <div className="space-y-3">
                      {forexRates
                        .filter((f) =>
                          f.pair.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((forex) => {
                          const matchedSignal = forexSignals.find((s) => s.symbol === forex.pair);
                          return (
                            <ForexCard
                              key={forex.pair}
                              forex={forex}
                              signal={matchedSignal}
                              isWatchlisted={watchlist.has(forex.pair)}
                              onToggleWatchlist={handleToggleWatchlist}
                              onSelect={() => setSelectedForex(forex)}
                            />
                          );
                        })}
                    </div>
                  )}

                  {selectedTab === 2 && (
                    <div className="space-y-3">
                      {thaiStocks
                        .filter(
                          (s) =>
                            s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            s.name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((stock) => {
                          const matchedSignal = thaiStockSignals.find((s) => s.symbol === stock.symbol);
                          return (
                            <ThaiStockCard
                              key={stock.symbol}
                              stock={stock}
                              signal={matchedSignal}
                              isWatchlisted={watchlist.has(stock.symbol)}
                              onToggleWatchlist={handleToggleWatchlist}
                              onSelect={() => setSelectedThaiStock(stock)}
                            />
                          );
                        })}
                    </div>
                  )}

                  {selectedTab === 3 && (
                    <div className="space-y-3">
                      {foreignStocks
                        .filter(
                          (s) =>
                            s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            s.name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((stock) => {
                          const matchedSignal = foreignStockSignals.find((s) => s.symbol === stock.symbol);
                          return (
                            <ForeignStockCard
                              key={stock.symbol}
                              stock={stock}
                              signal={matchedSignal}
                              isWatchlisted={watchlist.has(stock.symbol)}
                              useThb={useThb}
                            usdThbRate={usdThbRate}
                              onToggleWatchlist={handleToggleWatchlist}
                              onSelect={() => setSelectedForeignStock(stock)}
                            />
                          );
                        })}
                    </div>
                  )}

                  {selectedTab === 4 && (
                    <div className="space-y-3">
                      {stockIndices
                        .filter(
                          (s) =>
                            s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            s.name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((stock) => (
                          <StockCard
                            key={stock.symbol}
                            stock={stock}
                            marketStatusText={marketHours.setStatus}
                            countdown={marketHours.countdown}
                            useThb={useThb}
                            usdThbRate={usdThbRate}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Sidebar Column: Market Hours & System Health (col-span-4) */}
              <div className="lg:col-span-4 space-y-6">
                {/* The mascot is not a dashboard card any more: it floats over the
                    page and speaks only when the detectors actually catch
                    something (see MascotOverlay + the auto-detect effects above). */}
                <MarketHoursCard marketHours={marketHours} />
                {/* รายละเอียด API/Error Handling ถูกย่อไว้ในแท็บพับได้ ลดความรกของ sidebar */}
                <SystemHealthPanel status={apiStatus} onRefresh={handleRefreshAllApis} />
              </div>
            </div>
          </main>

          {/* Eye-Friendly Footer */}
          <footer className="py-6 border-t border-white/[0.07] text-xs text-[#A7A4B8] transition-colors">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#ECEAF4]">MotorBoy AI-TH</span>
                <span>·</span>
                <span>Real-Time Multi-Asset & AI Deep Analytics</span>
              </div>
              {globalSession?.title && (
                <div className="text-[11px] px-2.5 py-1 rounded-lg bg-[#141725] border border-white/[0.07] text-[#A7A4B8]">
                  Global Session: <span className="font-medium text-[#ECEAF4]">{globalSession.title}</span>
                </div>
              )}
            </div>
          </footer>
        </div>

          {/* Signal Detail Modal */}
          {selectedSignal && (
            <SignalDetailModal
              signal={selectedSignal}
              coin={cryptoList.find((c) => c.symbol === selectedSignal?.symbol)}
              useThb={useThb && !selectedSignal.symbol.includes('/')}
              usdThbRate={usdThbRate}
              geminiApiKey={geminiApiKey}
              onSaveToHistory={handleSaveToHistory}
              onDismiss={() => setSelectedSignal(null)}
            />
          )}

          {/* Forex Detail Modal */}
          {selectedForex && (
            <ForexDetailModal
              forex={selectedForex}
              signal={forexSignals.find((s) => s.symbol === selectedForex.pair)}
              geminiApiKey={geminiApiKey}
              onSaveToHistory={handleSaveToHistory}
              onDismiss={() => setSelectedForex(null)}
            />
          )}

          {/* Thai Stock Detail Modal */}
          {selectedThaiStock && (
            <StockDetailModal
              symbol={selectedThaiStock.symbol}
              name={selectedThaiStock.name}
              nameEn={selectedThaiStock.nameEn}
              price={selectedThaiStock.price}
              change={selectedThaiStock.change}
              volume={selectedThaiStock.volume}
              sector={selectedThaiStock.sector}
              pe={selectedThaiStock.pe}
              dividendYield={selectedThaiStock.dividendYield}
              marketCap={selectedThaiStock.marketCap}
              isThaiStock={true}
              isLive={selectedThaiStock.isLive}
              updatedAt={selectedThaiStock.updatedAt}
              useThb={useThb}
                            usdThbRate={usdThbRate}
              geminiApiKey={geminiApiKey}
              onSaveToHistory={handleSaveToHistory}
              onDismiss={() => setSelectedThaiStock(null)}
            />
          )}

          {/* Foreign Stock Detail Modal */}
          {selectedForeignStock && (
            <StockDetailModal
              symbol={selectedForeignStock.symbol}
              name={selectedForeignStock.name}
              price={selectedForeignStock.price}
              change={selectedForeignStock.change}
              volume={selectedForeignStock.volume}
              sector={selectedForeignStock.sector}
              pe={selectedForeignStock.pe}
              marketCap={selectedForeignStock.marketCap}
              isThaiStock={false}
              isLive={selectedForeignStock.isLive}
              updatedAt={selectedForeignStock.updatedAt}
              useThb={useThb}
                            usdThbRate={usdThbRate}
              geminiApiKey={geminiApiKey}
              onSaveToHistory={handleSaveToHistory}
              onDismiss={() => setSelectedForeignStock(null)}
            />
          )}




          {showSettings && (
            <SettingsDialog
              useThb={useThb}
              onToggleCurrency={handleToggleCurrency}
              notificationsEnabled={notificationsEnabled}
              onToggleNotifications={handleToggleNotifications}
              onSetAlert={handleSetAlert}
              geminiApiKey={geminiApiKey}
              onSaveApiKey={handleSaveApiKey}
              userEmail={user?.email ?? null}
              priceAlerts={priceAlerts}
              onRemoveAlert={handleRemoveAlert}
              psychologySettings={psychologySettings}
              onSavePsychologySettings={handleSavePsychologySettings}
              onDismiss={() => setShowSettings(false)}
            />
          )}




          {/* Risk Calculator Modal */}
          <RiskCalculatorModal
            riskTolerance={psychologySettings.riskToleranceLevel}
            isOpen={showRiskCalc}
            onClose={() => setShowRiskCalc(false)}
            useThb={useThb}
            usdThbRate={usdThbRate}
            signals={allSignals}
            cryptoList={cryptoList}
            geminiApiKey={geminiApiKey}
            onSaveToHistory={handleSaveToHistory}
          />

          {/* Dedicated Drawdown Monitor Modal */}
          <DrawdownMonitorModal
            isOpen={showDrawdownModal}
            onClose={() => setShowDrawdownModal(false)}
            assets={drawdownAssets}
            summary={portfolioDrawdownSummary}
            thresholds={drawdownThresholds}
            onUpdateThresholds={(next) => {
              setDrawdownThresholds(next);
              saveThresholds(next);
            }}
            onUpdateCustomPeak={(symbol, peak) => {
              setCustomPeaks((prev) => ({ ...prev, [symbol]: peak }));
              saveCustomPeak(symbol, peak);
            }}
            onSendReportToChat={handleSendDrawdownToChat}
            isDark={isDark}
          />

          {/* Gmail Trading Alert Hub */}
          {showGmail && (
            <GmailModal
              isOpen={showGmail}
              onClose={() => setShowGmail(false)}
              userEmail={user?.email ?? null}
              signals={signals}
              isDark
            />
          )}

          {/* Calendar Trading Events */}
          {showCalendar && (
            <CalendarModal
              isOpen={showCalendar}
              onClose={() => setShowCalendar(false)}
              userEmail={user?.email ?? null}
              isDark
            />
          )}

          {/* AI Deep Analyze Chat Room (AI 100%) */}
          {showChat && (
            <ChatModal
              isOpen={showChat}
              onClose={() => {
                setShowChat(false);
                setChatSeed('');
              }}
              initialQuestion={chatSeed}
              user={user}
              cryptoList={cryptoList}
              forexRates={forexRates}
              thaiStocks={thaiStocks}
              foreignStocks={foreignStocks}
              stockIndices={stockIndices}
              articles={newsList}
              geminiApiKey={geminiApiKey}
              onOpenAtsMatrix={() => setShowAtsMatrixModal(true)}
              onOpenSettings={() => setShowSettings(true)}
              isDark
            />
          )}

          {/* News & AI Analysis Hub Modal */}
          {showNewsModal && (
            <div
              ref={newsModalRef}
              role="dialog"
              aria-modal="true"
              aria-label="ศูนย์รวมข่าวสารตลาดและวิเคราะห์ AI"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
              <div className="w-full max-w-2xl bg-[#141725] border border-[#222640] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-[#222640] flex items-center justify-between bg-gradient-to-r from-[#1C1F2E] to-[#141725]">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C6CFF] to-[#8E80FF] p-[1.5px]">
                      <div className="w-full h-full bg-[#0F1117] rounded-[6.5px] flex items-center justify-center text-xs">
                        🏍️
                      </div>
                    </div>
                    <h2 className="text-white font-black text-sm tracking-tight">
                      MotorBoy News & Analysis Hub
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowNewsModal(false)}
                    className="text-[#A7A4B8] hover:text-white p-1 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                  <NewsCard
                    articles={newsList}
                    signals={signals}
                    geminiApiKey={geminiApiKey}
                    onSaveToHistory={handleSaveToHistory}
                    onNavigateToHistory={() => {
                      setShowNewsModal(false);
                      setShowHistoryModal(true);
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Watchlist Modal */}
          {showWatchlistModal && (
            <div
              ref={watchlistModalRef}
              role="dialog"
              aria-modal="true"
              aria-label="รายการโปรด Watchlist"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
              <div className="w-full max-w-2xl bg-[#141725] border border-[#222640] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-[#222640] flex items-center justify-between bg-gradient-to-r from-[#1C1F2E] to-[#141725]">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-[#7C6CFF] fill-[#7C6CFF]" />
                    <h2 className="text-white font-bold text-sm">
                      รายการโปรด (Watchlist) ของฉัน
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowWatchlistModal(false)}
                    className="text-[#A7A4B8] hover:text-white p-1 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto flex-1 space-y-3">
                  {watchlistCryptoSignals.length > 0 ||
                  watchlistForexSignals.length > 0 ||
                  filteredWatchThaiStocks.length > 0 ||
                  filteredWatchForeignStocks.length > 0 ? (
                    <>
                      {watchlistCryptoSignals.map((sig) => {
                        const coin = cryptoList.find((c) => c.symbol === sig.symbol);
                        return (
                          <CryptoCard
                            key={sig.id}
                            signal={sig}
                            coin={coin}
                            isWatchlisted={true}
                            useThb={useThb}
                            usdThbRate={usdThbRate}
                            onToggleWatchlist={handleToggleWatchlist}
                            onSelect={() => {
                              setSelectedSignal(sig);
                              setShowWatchlistModal(false);
                            }}
                          />
                        );
                      })}
                      {watchlistForexSignals.map((sig) => {
                        const forex = forexRates.find((f) => f.pair === sig.symbol) || {
                          pair: sig.symbol,
                          price: sig.price,
                          change: sig.change,
                        };
                        return (
                          <ForexCard
                            key={sig.id}
                            forex={forex}
                            signal={sig}
                            isWatchlisted={true}
                            onToggleWatchlist={handleToggleWatchlist}
                            onSelect={() => {
                              setSelectedForex(forex);
                              setShowWatchlistModal(false);
                            }}
                          />
                        );
                      })}
                      {filteredWatchThaiStocks.map((stock) => {
                        const matchedSignal = thaiStockSignals.find(
                          (s) => s.symbol === stock.symbol
                        );
                        return (
                          <ThaiStockCard
                            key={stock.symbol}
                            stock={stock}
                            signal={matchedSignal}
                            isWatchlisted={true}
                            onToggleWatchlist={handleToggleWatchlist}
                            onSelect={() => {
                              setSelectedThaiStock(stock);
                              setShowWatchlistModal(false);
                            }}
                          />
                        );
                      })}
                      {filteredWatchForeignStocks.map((stock) => {
                        const matchedSignal = foreignStockSignals.find(
                          (s) => s.symbol === stock.symbol
                        );
                        return (
                          <ForeignStockCard
                            key={stock.symbol}
                            stock={stock}
                            signal={matchedSignal}
                            isWatchlisted={true}
                            useThb={useThb}
                            usdThbRate={usdThbRate}
                            onToggleWatchlist={handleToggleWatchlist}
                            onSelect={() => {
                              setSelectedForeignStock(stock);
                              setShowWatchlistModal(false);
                            }}
                          />
                        );
                      })}
                    </>
                  ) : (
                    <div className="rounded-[18px] bg-[#141725] border border-white/[0.07] p-8 text-center">
                      <p className="text-white text-sm font-semibold">
                        ยังไม่มีรายการใน Watchlist
                      </p>
                      <p className="text-[#A7A4B8] text-xs mt-1">
                        แตะรูปดาว ⭐️ ที่การ์ดคริปโต คู่เงิน Forex หรือหุ้นไทย/ต่างประเทศ เพื่อเพิ่มลงในรายการโปรด
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* History Modal */}
          {showHistoryModal && (
            <div
              ref={historyModalRef}
              role="dialog"
              aria-modal="true"
              aria-label="ประวัติการวิเคราะห์"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
              <div className="w-full max-w-3xl bg-[#141725] border border-[#222640] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-[#222640] flex items-center justify-between bg-gradient-to-r from-[#1C1F2E] to-[#141725]">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-[#7EE0B5]" />
                    <h2 className="text-white font-bold text-sm">
                      ประวัติการวิเคราะห์ & สัญญาณที่บันทึก (Google Sync)
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="text-[#A7A4B8] hover:text-white p-1 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                  <HistoryList
                    entries={historyEntries}
                    userEmail={user?.email ?? null}
                    useThb={useThb}
                    usdThbRate={usdThbRate}
                    onDeleteEntry={handleDeleteHistoryEntry}
                    onClearAll={handleClearAllHistory}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ATS Matrix Mode Modal */}
          {showAtsMatrixModal && (
            <div
              ref={atsModalRef}
              role="dialog"
              aria-modal="true"
              aria-label="ATS Matrix Cockpit"
              className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
              <div className="w-full max-w-5xl my-auto">
                <AtsMatrixDashboard
                  isModal
                  cryptoList={cryptoList}
                  isDark={isDark}
                  onClose={() => setShowAtsMatrixModal(false)}
                  onSendToChat={handleSendAtsToChat}
                />
              </div>
            </div>
          )}

      {/* Floating AI mascot — pointer-events-none wrapper, never blocks the UI */}
      {/* No data props: the mascot subscribes to the published feed, so it can
          be mounted on any surface and still see live market context. */}
      <MascotOverlay onOpenChat={() => openChat()} />
    </>
  );
};




export default App;
