import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, Sparkles, X, Star, History, Radio } from 'lucide-react';
import { signOut, User } from 'firebase/auth';
import { auth } from './firebase';
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
import { t } from './i18n';
import { getLiveUsdThb } from './utils';
import { Header } from './components/Header';
import { CryptoCard } from './components/CryptoCard';
import { ForexCard } from './components/ForexCard';
import { StockCard } from './components/StockCard';
import { ThaiStockCard } from './components/ThaiStockCard';
import { ForeignStockCard } from './components/ForeignStockCard';
import { PriceChartCanvas } from './components/PriceChartCanvas';
import { MarketHoursCard } from './components/MarketHoursCard';
import { NewsCard } from './components/NewsCard';
import { ApiStatusCard } from './components/ApiStatusCard';
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
  const [user, setUser] = useState<User | null>({ uid: 'guest', displayName: 'Guest' } as unknown as User);

  useEffect(() => {
    // Auth bypass: just set guest user
    setUser({ uid: 'guest', displayName: 'Guest' } as unknown as User);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  // State
  const [cryptoList, setCryptoList] = useState<CryptoCoin[]>(CRYPTO_INITIAL);
  const [forexRates, setForexRates] = useState<ForexPair[]>([]);
  const [stockIndices, setStockIndices] = useState<StockIndex[]>(STOCK_SYMBOLS);
  const [signals, setSignals] = useState<TradingSignal[]>(() =>
    generateRealSignals(CRYPTO_INITIAL)
  );
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [useThb, setUseThb] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(true);
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
  const [showRiskCalc, setShowRiskCalc] = useState<boolean>(false);
  const [showDrawdownModal, setShowDrawdownModal] = useState<boolean>(false);
  const [drawdownDismissed, setDrawdownDismissed] = useState<boolean>(false);
  const [drawdownThresholds, setDrawdownThresholds] = useState<DrawdownThresholds>(loadThresholds);
  const [customPeaks, setCustomPeaks] = useState<Record<string, number>>(loadCustomPeaks);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [historyEntries, setHistoryEntries] = useState<TradingHistoryEntry[]>([]);

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
      }),
    [cryptoList, thaiStocks, foreignStocks, forexRates, drawdownThresholds, customPeaks]
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

  // Embedded calming music: load YouTube IFrame API, ramp volume 0→70%, loop forever.
  useEffect(() => {
    initBgMusic();
    return () => {
      stopBgMusic();
    };
  }, []);

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
  }, [updateCryptoPrices, updateForex, updateStocks, updateNews]);

  // 1. Binance WebSocket Connection with auto-reconnect & immediate fallback
  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;

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
          setCryptoList((prev) => {
            return prev.map((c) => {
              if (c.binanceSymbol.toLowerCase() === updatedCoin.binanceSymbol.toLowerCase()) {
                const flash =
                  updatedCoin.price > c.price
                    ? 'UP'
                    : updatedCoin.price < c.price
                    ? 'DOWN'
                    : 'NONE';
                return {
                  ...c,
                  price: updatedCoin.price,
                  change: updatedCoin.change,
                  high: updatedCoin.high,
                  low: updatedCoin.low,
                  volume: updatedCoin.volume,
                  flash,
                };
              }
              return c;
            });
          });
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

  // 2. Refresh crypto signals on a 15s throttle
  useEffect(() => {
    const updateSignals = () => setSignals(generateRealSignals(cryptoListRef.current));
    updateSignals();
    const interval = setInterval(updateSignals, 15000);
    return () => clearInterval(interval);
  }, []);

  // 3. Crypto REST Fallback Polling (immediate mount + every 30s)
  useEffect(() => {
    updateCryptoPrices();
    const interval = setInterval(updateCryptoPrices, 30000);
    return () => clearInterval(interval);
  }, [updateCryptoPrices]);

  // 4. Forex Periodic Polling (immediate mount + every 15s)
  useEffect(() => {
    updateForex();
    const interval = setInterval(updateForex, 15000);
    return () => clearInterval(interval);
  }, [updateForex]);

  // 5. Thai & Foreign Stock + Index Polling (immediate mount + every 60s)
  useEffect(() => {
    updateStocks();
    const interval = setInterval(updateStocks, 60000);
    return () => clearInterval(interval);
  }, [updateStocks]);

  // 6. News Periodic Polling (immediate mount + every 300s)
  useEffect(() => {
    updateNews();
    const interval = setInterval(updateNews, 300000);
    return () => clearInterval(interval);
  }, [updateNews]);

  // 7. Clock tick every 1s for Bangkok ICT Market Hours
  useEffect(() => {
    const interval = setInterval(() => {
      setMarketHours(computeMarketHours());
    }, 1000);
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

  // All tradeable signals for the risk calculator picker
  const allSignals = useMemo(
    () => [...signals, ...forexSignals, ...thaiStockSignals, ...foreignStockSignals],
    [signals, forexSignals, thaiStockSignals, foreignStockSignals]
  );

  // 7. Load Chart Data for Selected Asset
  useEffect(() => {
    let isCancelled = false;
    setChartLoading(true);

    fetchPriceHistory(
      selectedChartAsset,
      forexPairSet.has(selectedChartAsset)
    ).then((data) => {
      if (!isCancelled) {
        setChartData(data);
        setChartLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedChartAsset, forexPairSet]);

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
    setGeminiApiKey(newKey);
    const targetUid = user?.uid || 'local';
    await saveUserSettings(targetUid, { geminiApiKey: newKey });
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
    <div
      className={`min-h-screen ${
        isDark ? 'bg-[#0F1117] text-white' : 'bg-[#F8FAFC] text-[#0F172A]'
      } flex flex-col font-sans transition-colors duration-200 overflow-x-hidden w-full max-w-[100vw]`}
    >
      {/* Toast Notification */}
          {alertToast && (
            <div className="fixed top-4 right-4 left-4 sm:left-auto z-[60] sm:max-w-sm bg-[#7C6CFF] text-white px-4 py-3 rounded-2xl shadow-xl border border-white/20 flex items-center justify-between space-x-3 animate-fade-in">
              <span className="text-xs font-semibold">{alertToast}</span>
              <button
                type="button"
                onClick={() => setAlertToast(null)}
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
            onToggleTheme={() => setIsDark(!isDark)}
            onToggleNotifications={() =>
              setNotificationsEnabled(!notificationsEnabled)
            }
            onOpenSettings={() => setShowSettings(true)}
            onOpenGmail={() => setShowGmail(true)}
            onOpenCalendar={() => setShowCalendar(true)}
            onOpenChat={() => setShowChat(true)}
            onOpenRiskCalc={() => setShowRiskCalc(true)}
            onOpenDrawdown={() => setShowDrawdownModal(true)}
            onOpenAtsMatrix={() => setShowAtsMatrixModal(true)}
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
                  <div className="rounded-[20px] bg-[#1A1D29] border border-[#252A3A] p-3 shadow-lg">
                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                      {/* Tabs / Filters */}
                      <div className="flex items-center space-x-1 bg-[#0F1117] p-1 rounded-xl border border-[#252A3A] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] max-w-full">
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
                                ? 'bg-[#7C6CFF] text-white font-bold shadow-xs'
                                : 'text-[#9CA3AF] hover:text-white'
                            }`}
                          >
                            <span>{tab.label}</span>
                            {tab.count > 0 && (
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                  selectedTab === idx
                                    ? 'bg-black/30 text-white'
                                    : 'bg-[#252A3A] text-[#A5B4FC]'
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
                          <Search className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="ค้นหาสินทรัพย์..."
                            className="w-full sm:w-44 bg-[#0F1117] border border-[#252A3A] focus:border-[#7C6CFF] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white outline-none placeholder-[#6B7280]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowWatchlistModal(true)}
                          className="px-3 py-1.5 bg-[#7C6CFF]/20 hover:bg-[#7C6CFF]/30 border border-[#7C6CFF]/40 text-[#A5B4FC] rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shrink-0"
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
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#7C6CFF] text-white">
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
                          className="px-3 py-1.5 bg-[#10B981]/20 hover:bg-[#10B981]/30 border border-[#10B981]/40 text-[#34D399] rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shrink-0"
                          title="เปิดหน้าต่างประวัติการวิเคราะห์"
                        >
                          <History className="w-3.5 h-3.5 text-[#10B981]" />
                          <span className="hidden sm:inline">ประวัติ</span>
                          {historyEntries.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#10B981] text-white">
                              {historyEntries.length}
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowNewsModal(true)}
                          className="px-3 py-1.5 bg-[#0284C7]/20 hover:bg-[#0284C7]/30 border border-[#0284C7]/40 text-[#38BDF8] rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shrink-0"
                          title="เปิดหน้าต่างข่าวสาร & วิเคราะห์ AI"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">ข่าว & วิเคราะห์ AI</span>
                        </button>

                        {/* ATS Matrix Mode Button */}
                        <button
                          type="button"
                          onClick={() => setShowAtsMatrixModal(true)}
                          className="px-3 py-1.5 bg-[#00FF66]/20 hover:bg-[#00FF66]/30 border border-[#00FF66]/50 text-[#00FF66] rounded-xl text-xs font-mono font-bold inline-flex items-center gap-1.5 transition-all shrink-0 shadow-[0_0_12px_rgba(0,255,102,0.2)] animate-pulse"
                          title="เปิดโหมด ATS MATRIX (Polymarket & Crypto Arbitrage)"
                        >
                          <Radio className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">⚡ ATS Matrix</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#00FF66] text-black font-extrabold">
                            LIVE
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Auto-detected ATS MATRIX Trigger Banner */}
                    {isAtsMatrixTrigger(searchQuery) && (
                      <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-[#00FF66]/20 via-[#0A0D14] to-[#00F0FF]/20 border border-[#00FF66]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(0,255,102,0.15)] animate-in fade-in duration-300">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#00FF66]/20 border border-[#00FF66]/50 flex items-center justify-center text-[#00FF66] shrink-0 animate-pulse">
                            <Radio className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-mono font-black text-white flex items-center gap-2">
                              <span>⚡ สลับเป็น ATS MATRIX MODE (MARKETS / BTC / POLYMARKET)</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-[#00FF66] text-black font-extrabold">
                                AUTO-DETECTED
                              </span>
                            </div>
                            <p className="text-[11px] font-mono text-slate-300 mt-0.5">
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
                            className="px-3 py-1.5 rounded-lg bg-[#00FF66] hover:bg-[#00FF66]/90 text-black text-xs font-mono font-black transition-all shadow-[0_0_12px_rgba(0,255,102,0.3)] cursor-pointer"
                          >
                            เปิด Cockpit ทันที
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsAtsMatrixMode((v) => !v)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold transition-all border border-slate-700 cursor-pointer"
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
                <div className="rounded-[20px] bg-[#1A1D29] border border-[#252A3A] p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-[#252A3A]/60 gap-2">
                    <div>
                      <h2 className="text-white font-bold text-sm">
                        กราฟราคา 90 วัน & ค่าเฉลี่ย EMA (20/50)
                      </h2>
                      <p className="text-[#6B7280] text-[11px] mt-0.5">
                        {selectedTab === 0 && 'ดึงข้อมูล Binance 1D Klines จริง วิเคราะห์เส้น EMA (20/50) และแนวรับ-แนวต้าน'}
                        {selectedTab === 1 && 'ดึงข้อมูลอัตราแลกเปลี่ยน Forex 1D Closes จริง วิเคราะห์กรอบสวิง 90 วัน'}
                        {selectedTab === 2 && 'ดึงข้อมูลราคาปิดหุ้นไทย SET (.BK) รายวันจากตลาดหลักทรัพย์ พร้อมแนวรับ-แนวต้าน'}
                        {selectedTab === 3 && 'ดึงข้อมูลหุ้นสหรัฐฯ (US Equities) รายวันจาก NASDAQ/NYSE พร้อมเส้น EMA'}
                        {selectedTab === 4 && 'ดึงข้อมูลดัชนีตลาดหลักทรัพย์ (SET, NASDAQ, S&P 500, DJI) กรอบย้อนหลัง 90 วัน'}
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
                              ? 'bg-[#7C6CFF] text-white shadow-xs'
                              : 'bg-[#0F1117] text-[#9CA3AF] hover:text-white border border-[#252A3A]'
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
                              ? 'bg-[#10B981] text-white shadow-xs'
                              : 'bg-[#0F1117] text-[#9CA3AF] hover:text-white border border-[#252A3A]'
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
                              ? 'bg-[#F59E0B] text-black shadow-xs font-black'
                              : 'bg-[#0F1117] text-[#9CA3AF] hover:text-white border border-[#252A3A]'
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
                              ? 'bg-[#38BDF8] text-black shadow-xs font-black'
                              : 'bg-[#0F1117] text-[#9CA3AF] hover:text-white border border-[#252A3A]'
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
                              ? 'bg-[#EC4899] text-white shadow-xs'
                              : 'bg-[#0F1117] text-[#9CA3AF] hover:text-white border border-[#252A3A]'
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

              {/* Right Sidebar Column: Market Hours & API Status (col-span-4) */}
              <div className="lg:col-span-4 space-y-6">
                <MarketHoursCard marketHours={marketHours} />
                <ApiStatusCard status={apiStatus} onRefresh={handleRefreshAllApis} />
              </div>
            </div>
          </main>

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
              onDismiss={() => setShowSettings(false)}
            />
          )}

          {/* Risk Calculator Modal */}
          <RiskCalculatorModal
            isOpen={showRiskCalc}
            onClose={() => setShowRiskCalc(false)}
            useThb={useThb}
            usdThbRate={usdThbRate}
            signals={allSignals}
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
              onClose={() => setShowChat(false)}
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
              <div className="w-full max-w-2xl bg-[#131722] border border-[#2A2E39] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-[#2A2E39] flex items-center justify-between bg-gradient-to-r from-[#1E222D] to-[#131722]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#38BDF8]" />
                    <h2 className="text-white font-bold text-sm">
                      ศูนย์รวมข่าวสารตลาด & วิเคราะห์ AI (Poolside)
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowNewsModal(false)}
                    className="text-[#94A3B8] hover:text-white p-1 rounded-lg transition-colors"
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
              <div className="w-full max-w-2xl bg-[#131722] border border-[#2A2E39] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-[#2A2E39] flex items-center justify-between bg-gradient-to-r from-[#1E222D] to-[#131722]">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-[#7C6CFF] fill-[#7C6CFF]" />
                    <h2 className="text-white font-bold text-sm">
                      รายการโปรด (Watchlist) ของฉัน
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowWatchlistModal(false)}
                    className="text-[#94A3B8] hover:text-white p-1 rounded-lg transition-colors"
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
                    <div className="rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-8 text-center">
                      <p className="text-white text-sm font-semibold">
                        ยังไม่มีรายการใน Watchlist
                      </p>
                      <p className="text-[#6B7280] text-xs mt-1">
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
              <div className="w-full max-w-3xl bg-[#131722] border border-[#2A2E39] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-[#2A2E39] flex items-center justify-between bg-gradient-to-r from-[#1E222D] to-[#131722]">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-[#10B981]" />
                    <h2 className="text-white font-bold text-sm">
                      ประวัติการวิเคราะห์ & สัญญาณที่บันทึก (Google Sync)
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="text-[#94A3B8] hover:text-white p-1 rounded-lg transition-colors"
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
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
    </div>
  );
};

// Module-level player refs so the fade-in logic survives re-renders.
let bgPlayer: any = null;
let bgRampTimer: any = null;
let bgGestureCleanup: (() => void) | null = null;

/**
 * Start / restart the calming background music with a soft fade-in.
 * Volume is ramped up to 70%; video loops forever.
 * Includes user-gesture fallback for browsers blocking unmuted autoplay.
 * The player container is mounted directly to document.body outside React's
 * tree so YouTube's DOM modifications never cause React reconciliation errors.
 */
function initBgMusic(): void {
  const launch = () => {
    if (bgPlayer || bgRampTimer) return;
    try {
      const YT = (window as any).YT;
      if (!YT || !YT.Player) return;

      // Ensure the container is mounted outside React's DOM tree (#root)
      let host = document.getElementById('bg-music-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'bg-music-host';
        host.style.position = 'fixed';
        host.style.left = '-9999px';
        host.style.top = '-9999px';
        host.style.width = '1px';
        host.style.height = '1px';
        host.style.overflow = 'hidden';
        host.style.opacity = '0';
        host.style.pointerEvents = 'none';
        document.body.appendChild(host);
      }

      let playerTarget = document.getElementById('bg-music-target');
      if (!playerTarget) {
        playerTarget = document.createElement('div');
        playerTarget.id = 'bg-music-target';
        host.appendChild(playerTarget);
      }

      const rampVolume = (player: any) => {
        if (bgRampTimer) return;
        try {
          player.unMute();
        } catch {}
        let vol = 0;
        bgRampTimer = setInterval(() => {
          vol += 3;
          if (vol >= 70) {
            try { player.setVolume(70); } catch {}
            clearInterval(bgRampTimer);
            bgRampTimer = null;
          } else {
            try { player.setVolume(vol); } catch {}
          }
        }, 80);
      };

      bgPlayer = new YT.Player('bg-music-target', {
        videoId: 'TM9WY22YAaw',
        playerVars: {
          autoplay: 1,
          loop: 1,
          playlist: 'TM9WY22YAaw',
          controls: 0,
        },
        events: {
          onReady: (event: any) => {
            try {
              event.target.mute();
              event.target.setVolume(0);
              event.target.playVideo();
            } catch {}

            // Attempt initial unmuted ramp
            rampVolume(event.target);

            // In case the browser autoplay policy blocks unmuted audio before user gesture:
            const onGesture = () => {
              try {
                event.target.playVideo();
                rampVolume(event.target);
              } catch {}
              cleanupGesture();
            };

            const cleanupGesture = () => {
              window.removeEventListener('click', onGesture);
              window.removeEventListener('keydown', onGesture);
              window.removeEventListener('touchstart', onGesture);
              bgGestureCleanup = null;
            };

            bgGestureCleanup = cleanupGesture;
            window.addEventListener('click', onGesture, { once: true });
            window.addEventListener('keydown', onGesture, { once: true });
            window.addEventListener('touchstart', onGesture, { once: true });
          },
          onStateChange: (event: any) => {
            // Loop video if ended
            if (event.data === 0) {
              try { event.target.playVideo(); } catch {}
            }
          },
        },
      });
    } catch {
      // Silently ignore if API cannot initialize
    }
  };

  if ((window as any).YT && (window as any).YT.Player) {
    launch();
  } else {
    // If not loaded yet, inject script if needed and hook onYouTubeIframeAPIReady
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => {
        // Silently ignore if YouTube API cannot be reached in sandbox
      };
      document.head.appendChild(tag);
    }
    const prevReady = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') {
        try { prevReady(); } catch {}
      }
      launch();
    };
  }
}

/** Clean up the player on unmount. */
function stopBgMusic(): void {
  if (bgGestureCleanup) {
    bgGestureCleanup();
    bgGestureCleanup = null;
  }
  if (bgRampTimer) {
    clearInterval(bgRampTimer);
    bgRampTimer = null;
  }
  if (bgPlayer) {
    try { bgPlayer.stopVideo(); } catch {}
    try { bgPlayer.destroy(); } catch {}
    bgPlayer = null;
  }
  const host = document.getElementById('bg-music-host');
  if (host && host.parentNode) {
    try { host.parentNode.removeChild(host); } catch {}
  }
}

export default App;
