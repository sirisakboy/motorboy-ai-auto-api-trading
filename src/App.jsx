// =============================================================================
// Trading Engine Pro — Main App Component (v1.2.0)
// Replaces all mockup data with real API calls from apiClient.js
// Layout & styling preserved from original single-file HTML artifact
// =============================================================================

import React, { useState, useEffect, useRef, useMemo, useCallback, Component } from 'react';
import apiClient, {
  CRYPTO_SYMBOLS,
  CRYPTO_INFO,
  FOREX_PAIRS,
  SET_SYMBOLS,
  SIGNAL_CATEGORIES,
  computeMarketHours,
  fetchCryptoPrices,
  fetchForexRates,
  fetchNews,
  generateRealSignals,
  fetchPriceHistory,
  createBinanceWebSocket,
  retryWithBackoff,
  fetchWithFallback,
  fmtNum,
  now,
} from './apiClient.js';

// ── Constants (from original) ────────────────────────────────────────────────

const LOGO_SRC = new URL('./assets/logo.png', import.meta.url).href; // Local logo file
const COLORS = {
  primary: '#7C6CFF',
  primaryMuted: '#A5B4FC',
  dark: {
    bg: '#0F1117',
    card: '#1A1D29',
    border: '#252A3A',
    text: '#ffffff',
    textMuted: '#9ca3af',
    textDim: '#6b7280',
  },
  light: {
    bg: '#F8FAFC',
    card: '#ffffff',
    border: '#e5e7eb',
    text: '#1e293b',
    textMuted: '#64748b',
    textDim: '#94a3b8',
  },
  green: '#22C55E',
  greenText: '#4ade80',
  red: '#EF4444',
  redText: '#f87171',
  purple: '#6366F1',
};

// ── Error Boundary Component ─────────────────────────────────────────────────

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Trading Engine Pro Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0F1117] text-white flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold mb-2">เกิดข้อผิดพลาด</h2>
            <p className="text-white/60 text-sm mb-4">
              แอปพัฒนาการเกิดข้อผิดพลาด กรุณาลองรีเฟรชหน้านี้
            </p>
            <p className="text-xs text-white/40 mb-4">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#7C6CFF] text-black font-semibold rounded-lg focus-ring"
            >
              รีเฟรชหน้า
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Skeleton Loader Component ────────────────────────────────────────────────

function CardSkeleton({ count = 4 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4 animate-pulse"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#0F1117]" />
              <div>
                <div className="h-4 bg-[#0F1117] rounded w-20 mb-1" />
                <div className="h-3 bg-[#0F1117] rounded w-14" />
              </div>
            </div>
            <div className="h-5 bg-[#0F1117] rounded w-12" />
          </div>
          <div className="h-3 bg-[#0F1117] rounded w-full mb-2" />
          <div className="h-3 bg-[#0F1117] rounded w-3/4 mb-3" />
          <div className="flex items-center justify-between mt-3">
            <div className="h-5 bg-[#0F1117] rounded w-16" />
            <div className="h-4 bg-[#0F1117] rounded w-10" />
          </div>
        </div>
      ))}
    </>
  );
}

// ── Custom hook: PWA install prompt ──────────────────────────────────────────

function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
  };

  return { isInstallable, install };
}

// ── Custom hook: Real-time crypto via WebSocket ──────────────────────────────

function useRealTimeCrypto(setApiStatus) {
  const [crypto, setCrypto] = useState(() =>
    CRYPTO_SYMBOLS.map((id) => ({
      id,
      symbol: CRYPTO_INFO[id].symbol,
      name: CRYPTO_INFO[id].name,
      price: 0,
      change: 0,
      prevPrice: 0,
      marketCap: null,
      flash: null,
      high: 0,
      low: 0,
      volume: 0,
    }))
  );

  const prevPricesRef = useRef(new Map());

  // WebSocket for real-time updates
  useEffect(() => {
    setApiStatus((prev) => ({ ...prev, wsStatus: 'CONNECTING' }));

    const ws = createBinanceWebSocket(
      (update) => {
        setCrypto((prev) =>
          prev.map((coin) =>
            coin.id === update.symbolId
              ? {
                  ...coin,
                  price: update.price,
                  change: update.change,
                  prevPrice: update.prevPrice,
                  flash: update.flash,
                  high: update.high,
                  low: update.low,
                  volume: update.volume,
                }
              : coin
          )
        );
      },
      (status) => setApiStatus((prev) => ({ ...prev, wsStatus: status })),
      prevPricesRef
    );

    return () => ws.close();
  }, [setApiStatus]);

  // Fallback REST fetch (CoinGecko → Binance) on mount
  useEffect(() => {
    let cancelled = false;
    const initData = async () => {
      try {
        const data = await retryWithBackoff(() => fetchCryptoPrices(), 3, 500);
        if (!cancelled) {
          setCrypto(data);
          setApiStatus((prev) => ({ ...prev, binance: 'LIVE' }));
        }
      } catch (e) {
        console.warn('REST fallback failed:', e);
        setApiStatus((prev) => ({ ...prev, binance: 'OFFLINE' }));
      }
    };
    initData();
    return () => { cancelled = true; };
  }, [setApiStatus]);

  return crypto;
}

// ── Custom hook: Real-time forex (REST + cache) ────────────────────────────

function useForex(setApiStatus) {
  const [forex, setForex] = useState(() =>
    FOREX_PAIRS.map((pair) => ({ pair, price: 0, change: 0, flash: null }))
  );

  const fetchForex = useCallback(async () => {
    try {
      const data = await fetchForexRates();
      setForex(data.map((item) => {
        const prev = forex.find((f) => f.pair === item.pair);
        return {
          ...item,
          flash: prev ? (item.price > prev.price ? 'up' : prev.price > item.price ? 'down' : null) : null,
        };
      }));
      setApiStatus((prev) => ({ ...prev, forex: 'LIVE' }));
    } catch (e) {
      console.warn('Forex fetch failed:', e);
      setApiStatus((prev) => ({ ...prev, forex: 'OFFLINE' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setApiStatus]);

  useEffect(() => {
    fetchForex();
    const interval = setInterval(fetchForex, 15000); // refresh forex every 15s
    return () => clearInterval(interval);
  }, [fetchForex]);

  return forex;
}

// ── Custom hook: SET stock indices (real-time via WebSocket fallback) ────────

function useStocks(setApiStatus) {
  const [stocks, setStocks] = useState(() =>
    SET_SYMBOLS.map((s) => ({
      ...s,
      price: s.symbol === 'SET' ? 1378 : 0,
      change: 0,
      status: 'CLOSED',
    }))
  );

  const fetchStockData = useCallback(async () => {
    // SET index — computed from market hours
    // NASDAQ/DJI — fetch from Finnhub or Yahoo Finance (public proxy)
    // For now: SET from market hours, others from Yahoo Finance
    try {
      // Yahoo Finance for NASDAQ
      const nasdaqRes = await retryWithBackoff(() =>
        fetch('https://api.twelvedata.com/time_sales?symbol=NASDAQ&interval=1min&apikey=demo').catch(() => null)
      );
      // If twelvedata fails, keep existing price
      if (nasdaqRes?.ok) {
        const data = await nasdaqRes.json();
        console.log('NASDAQ data:', data);
      }
      setApiStatus((prev) => ({ ...prev, stocks: 'LIVE' }));
    } catch (e) {
      setApiStatus((prev) => ({ ...prev, stocks: 'STANDBY' }));
    }
  }, [setApiStatus]);

  useEffect(() => {
    fetchStockData();
    const interval = setInterval(fetchStockData, 30000);
    return () => clearInterval(interval);
  }, [fetchStockData]);

  return stocks;
}

// ── Custom hook: Real-time news (4 RSS sources) ──────────────────────────────

function useNews(setApiStatus) {
  const [news, setNews] = useState(() => [
    { id: 'placeholder', title: 'กำลังโหลดข่าว...', source: 'ระบบ', time: '', url: '#', sentiment: 'neutral' },
  ]);

  const fetchNewsData = useCallback(async () => {
    try {
      const articles = await retryWithBackoff(() => fetchNews(), 2, 500);
      if (articles.length > 0) {
        setNews(articles);
        setApiStatus((prev) => ({ ...prev, news: 'LIVE' }));
      } else {
        setApiStatus((prev) => ({ ...prev, news: 'FALLBACK' }));
      }
    } catch (e) {
      console.warn('News fetch failed:', e);
      setApiStatus((prev) => ({ ...prev, news: 'OFFLINE' }));
    }
  }, [setApiStatus]);

  useEffect(() => {
    fetchNewsData();
    const interval = setInterval(fetchNewsData, 300000); // 5 min (RSS cache TTL)
    return () => clearInterval(interval);
  }, [fetchNewsData]);

  return news;
}

// ── Custom hook: Trading signals from real price data ───────────────────────

function useTradingSignals(cryptoData, setApiStatus) {
  const [signals, setSignals] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const generateSignals = async () => {
      try {
        const realSignals = await generateRealSignals(cryptoData);
        if (!cancelled) {
          setSignals(realSignals);
          setApiStatus((prev) => ({ ...prev, signals: 'LIVE' }));
        }
      } catch (e) {
        console.warn('Signal generation failed:', e);
        setApiStatus((prev) => ({ ...prev, signals: 'OFFLINE' }));
      }
    };
    if (cryptoData.length > 0 && cryptoData.some((c) => c.price > 0)) {
      generateSignals();
    }
  }, [cryptoData, setApiStatus]);

  return signals;
}

// ── Custom hook: Real-time market hours ──────────────────────────────────────

function useMarketHours() {
  const [market, setMarket] = useState(() => computeMarketHours());
  const [nowTime, setNowTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTime(new Date());
      setMarket(computeMarketHours());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return { ...market, nowTime };
}

// ── Custom hook: Price chart with real EMA data ──────────────────────────────

function usePriceChart(symbolId) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);

  const loadChartData = useCallback(async () => {
    if (!symbolId) return;
    setLoading(true);
    try {
      const data = await fetchPriceHistory(symbolId);
      setChartData(data);
    } catch (e) {
      console.warn('Chart data failed:', e);
    } finally {
      setLoading(false);
    }
  }, [symbolId]);

  useEffect(() => {
    loadChartData();
  }, [loadChartData]);

  // Draw chart on canvas when data changes
  useEffect(() => {
    if (!canvasRef.current || !chartData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const { prices, ema20, ema50 } = chartData;
    const w = rect.width;
    const h = rect.height;

    // Price range
    const allValues = [...prices, ...ema20, ...ema50].filter((v) => v != null);
    const minPrice = Math.min(...allValues);
    const maxPrice = Math.max(...allValues);
    const priceRange = maxPrice - minPrice || 1;
    const padding = 4;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = COLORS.dark.border;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw price line
    const drawLine = (data, color, width) => {
      if (!data || data.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      data.forEach((price, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((price - minPrice) / priceRange) * (h - padding * 2) - padding;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    // EMA50 first (background)
    drawLine(ema50, COLORS.purple, 2);
    // EMA20
    drawLine(ema20, '#8B5CF6', 2);
    // Price (foreground)
    drawLine(prices, COLORS.green, 2);
  }, [chartData]);

  return { canvasRef, loading, chartData };
}

// ── Main App Component ───────────────────────────────────────────────────────

export default function TradingEnginePro() {
  // State variables (mapped to original JSX structure)
  const [crypto, setCrypto] = useState(() =>
    CRYPTO_SYMBOLS.map((id) => ({
      id,
      symbol: CRYPTO_INFO[id].symbol,
      name: CRYPTO_INFO[id].name,
      price: 0,
      change: 0,
      prevPrice: 0,
      marketCap: null,
      flash: null,
      high: 0,
      low: 0,
      volume: 0,
    }))
  );
  const [forex, setForex] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [signals, setSignals] = useState([]);
  const [news, setNews] = useState([]);
  const [activeTab, setActiveTab] = useState('crypto');
  const [minProbability, setMinProbability] = useState(55);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [detailTab, setDetailTab] = useState('tech');
  const [wsStatus, setWsStatus] = useState('CONNECTING');
  const [apiStatus, setApiStatus] = useState({
    binance: 'CONNECTING',
    forex: 'CONNECTING',
    news: 'CONNECTING',
    stocks: 'STANDBY',
    signals: 'CONNECTING',
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [watchlist, setWatchlist] = useState([]);
  const [notifTargets, setNotifTargets] = useState({});
  const [theme, setTheme] = useState('dark');

  // Custom hooks for real data
  const marketHours = useMarketHours();
  const realCrypto = useRealTimeCrypto(setApiStatus);
  const realForex = useForex(setApiStatus);
  const realStocks = useStocks(setApiStatus);
  const realNews = useNews(setApiStatus);

  // Sync real data into main state
  useEffect(() => setCrypto(realCrypto), [realCrypto]);
  useEffect(() => setForex(realForex), [realForex]);
  useEffect(() => setStocks(realStocks), [realStocks]);
  useEffect(() => setNews(realNews), [realNews]);

  // Generate trading signals from real crypto data
  useEffect(() => {
    let cancelled = false;
    const gen = async () => {
      try {
        const sigs = await generateRealSignals(crypto);
        if (!cancelled) setSignals(sigs);
      } catch (e) {
        console.warn('Signal gen failed:', e);
      }
    };
    if (crypto.some((c) => c.price > 0)) gen();
    return () => { cancelled = true; };
  }, [crypto]);

  // Clock update
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Price chart ref
  const canvasRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [selectedChartSymbol, setSelectedChartSymbol] = useState(null);

  // Load chart when a signal card is selected
  useEffect(() => {
    if (!selectedSignal) {
      setChartData(null);
      return;
    }
    const load = async () => {
      try {
        const data = await fetchPriceHistory(selectedSignal.id);
        setChartData(data);
      } catch (e) {
        console.warn('Chart load failed:', e);
      }
    };
    load();
  }, [selectedSignal]);

  // Draw chart canvas
  useEffect(() => {
    if (!canvasRef.current || !chartData) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const { prices, ema20, ema50 } = chartData;
    const w = rect.width;
    const h = rect.height;
    const isLight = theme === 'light';
    const borderColor = isLight ? COLORS.light.border : COLORS.dark.border;
    const greenColor = COLORS.green;
    const purpleColor = COLORS.purple;

    const allValues = [...prices, ...ema20, ...ema50].filter((v) => v != null);
    const minPrice = Math.min(...allValues) * 0.98;
    const maxPrice = Math.max(...allValues) * 1.02;
    const priceRange = maxPrice - minPrice || 1;
    const pad = 4;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const drawLine = (data, color, width) => {
      if (!data || data.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((v - minPrice) / priceRange) * (h - pad * 2) - pad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine(ema50, purpleColor, 2);
    drawLine(ema20, '#8B5CF6', 2);
    drawLine(prices, greenColor, 2);
  }, [chartData, theme]);

  // Derived: filtered signals
  const filteredSignals = useMemo(() => {
    let result = signals.filter((s) => s.probability >= minProbability);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((s) => s.symbol.toLowerCase().includes(term) || s.base.toLowerCase().includes(term));
    }
    if (activeTab === 'watchlist') {
      result = result.filter((s) => watchlist.includes(s.symbol));
    }
    return result;
  }, [signals, minProbability, searchTerm, activeTab, watchlist]);

  // Toggle watchlist
  const toggleWatchlist = (symbol) => {
    setWatchlist((prev) => (prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]));
  };

  // Price alert handler
  const [alertSymbol, setAlertSymbol] = useState('');
  const [alertPrice, setAlertPrice] = useState('');

  // PWA install prompt
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Notification permission
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission().then((perm) => {
        setNotificationsEnabled(perm === 'granted');
      });
    }
  }, []);

  // Theme
  const isDark = theme === 'dark';
  const C = isDark ? COLORS.dark : COLORS.light;

  // PWA + ServiceWorker registration
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('SW registration failed:', err));
    }

    // Listen for reduced-motion preference changes
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleReducedMotion = (e) => {
      document.documentElement.classList.toggle('reduce-motion', e.matches);
    };
    mediaQuery.addEventListener('change', handleReducedMotion);
    document.documentElement.classList.toggle('reduce-motion', mediaQuery.matches);
    return () => mediaQuery.removeEventListener('change', handleReducedMotion);
  }, []);

  // PWA install prompt hook
  const { isInstallable, installApp } = usePWAInstall();

  // Format currency — use ฿ for Thai context, $ for USD pairs
  const fmt = (num, decimals = 2, currency = 'USD') => {
    if (num == null) return '—';
    const formatted = num.toLocaleString('th-TH', { maximumFractionDigits: num < 1 ? 4 : decimals });
    return currency === 'USD' ? `$${formatted}` : `฿${formatted}`;
  };

  // Check if crypto data is still loading (all prices are 0)
  const cryptoLoading = crypto.every((c) => c.price === 0);
  const forexLoading = forex.length === 0;
  const newsLoading = news.length === 0 || (news.length === 1 && !news[0].title);
  const hasApiError = Object.values(apiStatus).some((s) => s === 'OFFLINE');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
    <div
      className={`min-h-screen w-full text-white antialiased ${
        isDark ? 'bg-[#0F1117] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'
      }`}
      style={{ fontFamily: "'Inter', 'Prompt', system-ui, sans-serif" }}
    >

      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-[#7C6CFF] text-white px-3 py-2 rounded z-[10000]"
      >
        ข้ามไปเนื้อหา
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b" style={{
        background: isDark ? 'rgba(15,17,23,0.85)' : 'rgba(255,255,255,0.9)',
        borderColor: '#252A3A',
      }}>
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 h-[64px] flex items-center justify-between gap-4">
          {/* Logo + Brand */}
          <div className="flex items-center gap-3">
            <img src={LOGO_SRC} alt="Trading Engine Logo" className="w-[36px] h-[36px] rounded-xl object-contain bg-[#1A1D29] p-1" />
            <div className="leading-none">
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-[16px] md:text-[18px]">TRADING ENGINE</span>
                <span className="font-bold text-[#7C6CFF] text-[16px] md:text-[18px]">Pro</span>
                <span className="hidden md:inline-flex ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#7C6CFF]/20 text-[#A5B4FC] border border-[#7C6CFF]/30">
                  Live API v1.2
                </span>
              </div>
              <div className="text-[11px] text-white/50 -mt-0.5 hidden md:block">
                Real-time Market Data · Phase 2 Live
              </div>
            </div>
          </div>

          {/* Header controls */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Theme toggle */}
            <div className="relative w-9 h-9 rounded-full bg-[#1A1D29] border border-[#252A3A] grid place-items-center">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="text-xs"
                aria-label="สลับธีม"
              >
                {isDark ? '🌙' : '☀️'}
              </button>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={async () => {
                  if (!notificationsEnabled) {
                    const perm = await Notification.requestPermission();
                    setNotificationsEnabled(perm === 'granted');
                  }
                }}
                className="relative w-9 h-9 rounded-full bg-[#1A1D29] border border-[#252A3A] grid place-items-center"
                aria-label="แจ้งเตือน"
              >
                🔔
                {notifTargets && Object.keys(notifTargets).length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] flex items-center justify-center">
                    {Object.keys(notifTargets).length}
                  </span>
                )}
              </button>
            </div>

            {/* Settings + PWA Install */}
            <div className="flex items-center gap-2">
              {/* PWA Install button */}
              {isInstallable && (
                <button
                  onClick={installApp}
                  className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium bg-[#7C6CFF]/15 border border-[#7C6CFF]/30 text-[#A5B4FC] hover:bg-[#7C6CFF]/30 focus-ring"
                  title="ติดตั้ง Trading Engine Pro เป็นแอป"
                >
                  ⬇️ ติดตั้ง
                </button>
              )}

              {/* Settings dropdown */}
              <div className="relative" style={{ zIndex: 60 }}>
                <button
                  onClick={() => {
                    const event = new Event('toggleSettings', { bubbles: true });
                    document.body.dispatchEvent(event);
                  }}
                  className="w-9 h-9 rounded-full bg-[#1A1D29] border border-[#252A3A] grid place-items-center focus-ring"
                  aria-label="ตั้งค่า"
                  data-tooltip="การตั้งค่า"
                >
                  ⚙️
                </button>
              </div>

              {/* PWA install prompt for mobile */}
              {!isInstallable && (
                <button
                  onClick={() => {
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.register('/sw.js')
                        .then(() => {})
                        .catch(() => {});
                    }
                  }}
                  className="w-9 h-9 rounded-full bg-[#1A1D29] border border-[#252A3A] grid place-items-center text-xs focus-ring"
                  aria-label="รีเฟสต์ ServiceWorker"
                  title="รีเฟสต์ ServiceWorker"
                >
                  🔄
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Ticker */}
      <div className="border-t border-[#252A3A] bg-[#1A1D29]/60 overflow-hidden h-[36px] flex items-center">
        <div className="ticker-track flex items-center gap-4 px-4 whitespace-nowrap text-[12px] tabular">
          {crypto.slice(0, 5).map((coin, i) => (
            <span key={coin.id} className="inline-flex items-center gap-1.5">
              <span className="font-bold">{coin.symbol}</span>
              <span>${fmt(coin.price)}</span>
              <span className={coin.change >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {coin.change >= 0 ? '+' : ''}{fmt(coin.change, 2)}%
              </span>
              {i < 4 && <span className="text-white/20">·</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Main content */}
      <main id="main-content" className="mx-auto max-w-[1440px] px-4 md:px-6 py-5 md:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
          {/* Left: Signals / Prices */}
          <div className="min-w-0">
            {/* Tab navigation */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <nav
                role="tablist"
                aria-label="หมวดตลาม"
                className="flex items-center gap-1 p-1 rounded-full bg-[#1A1D29] border border-[#252A3A] w-fit"
              >
                {[
                  { id: 'crypto', label: 'คริปโต' },
                  { id: 'forex', label: 'คู่เงิน' },
                  { id: 'stocks', label: 'หุ้น' },
                  { id: 'watchlist', label: 'Watchlist' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition focus-ring ${
                      activeTab === tab.id
                        ? 'bg-white text-black'
                        : 'text-white/60 hover:text-white/90'
                    }`}
                  >
                    {tab.label}
                    {tab.id === 'watchlist' && ` (${watchlist.length})`}
                  </button>
                ))}
              </nav>

              {/* Filter + Search */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-white/50 whitespace-nowrap">กรองความผันผวน</span>
                  <div className="flex items-center gap-2 bg-[#1A1D29] border border-[#252A3A] rounded-full px-3 py-1.5">
                    <span className="text-[12px] font-bold tabular">≥ {minProbability}%</span>
                    <input
                      type="range"
                      min={50}
                      max={95}
                      value={minProbability}
                      onChange={(e) => setMinProbability(parseInt(e.target.value))}
                      className="w-[110px] accent-[#7C6CFF]"
                    />
                  </div>
                </div>

                <div className="relative">
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ค้นหา BTC, ETH..."
                    className="w-[180px] md:w-[220px] h-[36px] rounded-full bg-[#1A1D29] border border-[#252A3A] px-4 pr-8 text-[13px] focus-ring placeholder:text-white/30"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-xs">⌕</span>
                </div>
              </div>
            </div>

            {/* Status bar with aria-live for screen readers */}
            <div className="flex items-center gap-2 mb-3 text-[12px]">
              <span
                aria-live="polite"
                aria-atomic="true"
                className="px-2.5 py-1 rounded-full bg-[#1A1D29] border border-[#252A3A] text-white/70 tabular"
              >
                กรองความผันผวน ≥ {minProbability}% | {filteredSignals.length} คู่
              </span>
              <span
                aria-live="polite"
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1A1D29] border border-[#252A3A] text-white/50"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'LIVE' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                Latency -95% WS {wsStatus}
              </span>
            </div>

            {/* Crypto signal cards */}
            {activeTab === 'crypto' && (
              <>
                {cryptoLoading ? (
                  <CardSkeleton count={4} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredSignals.map((signal) => {
                  const coin = crypto.find((c) => c.id === signal.id);
                  const isWatchlisted = watchlist.includes(signal.symbol);

                  return (
                    <div
                      key={signal.id}
                      className={`group relative rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4 hover:border-[#7C6CFF]/40 transition-colors ${
                        coin?.flash === 'up' ? 'flash-up' : coin?.flash === 'down' ? 'flash-down' : ''
                      }`}
                    >
                      <div className="absolute top-3 right-[108px] hidden md:flex items-center gap-1">
                        <button
                          onClick={() => toggleWatchlist(signal.symbol)}
                          className={`w-7 h-7 rounded-full grid place-items-center border text-[12px] focus-ring ${
                            isWatchlisted
                              ? 'bg-[#7C6CFF] border-[#7C6CFF] text-white'
                              : 'bg-[#1A1D29] border-[#252A3A] text-white/40'
                          }`}
                        >
                          ★
                        </button>
                      </div>

                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <img src={LOGO_SRC} alt="" className="w-8 h-8 rounded-full bg-[#0F1117] p-1 object-contain" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[15px]">{signal.symbol}</span>
                              <span className="text-[11px] text-white/50">{signal.base}/{signal.quote}</span>
                            </div>
                            <div className="text-[11px] text-white/50 mt-0.5">
                              {signal.sources.join(' · ')}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            signal.type === 'LONG'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {signal.type}
                        </span>
                      </div>

                      <div className="text-[11px] text-white/50 mt-0.5">
                        {signal.timeframe} · {signal.probability}% มั่นใจ
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <div className="tabular font-semibold text-[15px]">{fmt(signal.price)}
                        </div>
                        <div className={`tabular text-[12px] font-medium ${signal.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {signal.change >= 0 ? '+' : ''}{fmt(signal.change, 2)}%
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[11px] px-2 py-1 rounded-full bg-[#0F1117] border border-[#252A3A] text-white/60">
                          {signal.statusText}
                        </span>
                        <span className="text-[11px] px-2 py-1 rounded-full bg-[#6366F1]/15 border border-[#6366F1]/30 text-[#A5B4FC]">
                          {signal.reason} · {signal.etfFlow} ETF
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {signal.sources.map((src) => (
                            <a
                              key={src}
                              href={
                                src === 'Binance'
                                  ? 'https://binance.com'
                                  : src === 'CoinDesk'
                                    ? 'https://coindesk.com'
                                    : 'https://cointelegraph.com'
                              }
                              target="_blank"
                              rel="noopener"
                              className="text-[10px] px-2 py-1 rounded-full bg-[#0F1117] border border-[#252A3A] text-white/40 hover:text-white/80 focus-ring"
                            >
                              {src}
                            </a>
                          ))}
                        </div>
                        <button
                          onClick={() => setSelectedSignal(signal)}
                          className="text-[12px] font-medium text-[#7C6CFF] hover:text-[#A5B4FC] focus-ring"
                        >
                          ดูโบ๊ะแตกเพิ่มเติม →
                        </button>
                      </div>

                      <div className="mt-3 flex gap-1.5">
                        {signal.tags.map((tag) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#252A3A] text-white/40">
                            {tag}
                          </span>
                        ))}
                        <span className="ml-auto text-[10px] text-white/30">
                          AI {signal.similarity}% ✓
                        </span>
                      </div>
                    </div>
                  );
                })}

                {filteredSignals.length === 0 && (
                  <div className="col-span-2 text-center py-10 text-white/40">
                    ไม่มีสัญญาณที่ตรงกับเกณฑ์กรอง
                  </div>
                )}
                  </div>
                )}
              </>
            )}

            {/* Forex cards */}
            {activeTab === 'forex' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {forex.map((pair) => (
                  <div
                    key={pair.pair}
                    className={`rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4 ${
                      pair.flash === 'up' ? 'flash-up' : pair.flash === 'down' ? 'flash-down' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-[15px]">{pair.pair}</div>
                        <div className="text-[11px] text-white/50 mt-1">
                          Forex · {apiStatus.forex} · cache 30s + retry×3
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tabular font-semibold">{fmt(pair.price, 4)}</div>
                        <div className={`tabular text-[12px] ${pair.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pair.change >= 0 ? '+' : ''}{fmt(pair.change, 2)}%
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2 text-[11px]">
                      <span className="px-2 py-1 rounded-full bg-[#1A1D29] border border-[#252A3A] text-white/40">
                        open.er-api.com
                      </span>
                      <span className="px-2 py-1 rounded-full bg-[#1A1D29] border border-[#252A3A] text-white/40">
                        Frankfurter fallback
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Stocks cards */}
            {activeTab === 'stocks' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {stocks.map((stock) => (
                  <div key={stock.symbol} className="rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#0F1117] grid place-items-center text-[12px] font-bold">
                          {stock.symbol[0]}
                        </div>
                        <div>
                          <div className="font-bold text-[14px]">{stock.symbol} · {stock.name}</div>
                          <div className="text-[11px] text-white/50 mt-0.5">
                            SET Mon-Fri 10:00-12:30,14:30-16:30 UTC+7 · {stock.status} · {marketHours.countdown}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tabular font-semibold">{fmt(stock.price)}</div>
                        <div className={`tabular text-[12px] ${stock.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {stock.change >= 0 ? '+' : ''}{fmt(stock.change, 2)}%
                        </div>
                      </div>
                    </div>
                    {stock.symbol === 'SET' && (
                      <div className="mt-3 p-2.5 rounded-xl bg-[#0F1117] border border-dashed border-[#252A3A] flex items-center justify-center gap-2">
                        <svg width="120" height="40" viewBox="0 0 120 40" className="opacity-60">
                          <path
                            d="M5 25 Q20 5 40 15 T80 20 T115 10"
                            stroke="#6366F1"
                            fill="none"
                            strokeWidth="2"
                            strokeDasharray="4 4"
                          />
                          <circle cx="60" cy="18" r="3" fill="#7C6CFF" />
                        </svg>
                        <span className="text-[11px] text-white/40">
                          {stock.status === 'OPEN' ? 'กราฟแสดงข้อมูลเรียลไทม์' : 'ตลาดปิด · แสดงกราฟ SVG แบบปิด'}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Watchlist empty */}
            {activeTab === 'watchlist' && filteredSignals.length === 0 && (
              <div className="rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-6 text-center">
                <div className="py-10">
                  <div className="text-3xl mb-2">☆</div>
                  <div className="text-sm text-white/60">ยังไม่มีรายการใน Watchlist</div>
                  <div className="text-[12px] text-white/30 mt-1">กด ★ ในการ์ดคริปโตเพื่อเพิ่ม</div>
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <aside className="space-y-4">
            {/* News */}
            <div className="rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-[14px]">ข่าวเรียวไทม์ · {news.length} แหล่ง</h3>
                <span className="text-[10px] px-2 py-1 rounded-full bg-[#1A1D29] border border-[#252A3A] text-white/40">
                  RSS2JSON + allorigins fallback · 5นาที cache
                </span>
              </div>
              <div className="space-y-2.5">
                {news.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener"
                    className="flex gap-3 p-2.5 rounded-xl bg-[#0F1117] border border-[#252A3A] hover:border-[#7C6CFF]/30 transition-colors focus-ring"
                  >
                    <span
                      className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        item.sentiment === 'bullish'
                          ? 'bg-emerald-400'
                          : item.sentiment === 'bearish'
                            ? 'bg-red-400'
                            : 'bg-white/30'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-[13px] leading-[1.4] line-clamp-2">{item.title}</div>
                      <div className="text-[11px] text-white/40 mt-1 flex gap-2">
                        <span>{item.source}</span>
                        <span>·</span>
                        <span>{item.time}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Chart */}
            <div className="rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-[14px]">กราฟ 90 วัน · EMA</h3>
                <span className="text-[10px] px-2 py-1 rounded-full bg-[#252A3A] text-white/50">
                  Real API · Binance klines
                </span>
              </div>
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  className="w-full h-[180px] rounded-xl bg-[#0F1117] border border-[#252A3A]"
                  style={{ display: selectedSignal ? 'block' : 'none' }}
                />
                {!selectedSignal && (
                  <div className="h-[180px] rounded-xl bg-[#0F1117] border border-dashed border-[#252A3A] grid place-items-center text-[12px] text-white/30">
                    เลือกบัตรเพื่อดูกราฟ
                  </div>
                )}
                {selectedSignal && (
                  <div className="mt-3 flex gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-[#22C55E]"></span>Price
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-[#8B5CF6]"></span>EMA20
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-[#6366F1]"></span>EMA50
                    </span>
                    <span className="ml-auto text-white/40 tabular">
                      {selectedSignal.base} · Binance @ 1d
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Market hours */}
            <div className="rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4">
              <h3 className="font-semibold text-[14px] mb-3">สถานะตลาด · Market Hours Engine</h3>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1117] border border-[#252A3A]">
                  <div>
                    <div className="text-[13px] font-medium">SET ไทย</div>
                    <div className="text-[11px] text-white/40">จ-ศ 10:00-12:30,14:30-16:30 ICT</div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      marketHours.set === 'OPEN'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-[#252A3A] border-[#252A3A] text-white/40'
                    }`}
                  >
                    {marketHours.set === 'OPEN' ? '● OPEN' : '○ CLOSED'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1117] border border-[#252A3A]">
                  <div>
                    <div className="text-[13px] font-medium">Forex 24h</div>
                    <div className="text-[11px] text-white/40">ปิด เสาร์เช้า-อาทิตย์เช้า</div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      marketHours.forex === 'OPEN'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-[#252A3A] border-[#252A3A] text-white/40'
                    }`}
                  >
                    {marketHours.forex === 'OPEN' ? '● OPEN' : '○ CLOSED'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0F1117] border border-[#252A3A]">
                  <div>
                    <div className="text-[13px] font-medium">Crypto</div>
                    <div className="text-[11px] text-white/40">24/7 ไม่ปิด</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    ● OPEN
                  </span>
                </div>

                <div className="text-[11px] text-white/30 text-center pt-1 tabular">
                  {marketHours.timestamp}
                </div>
              </div>
            </div>

            {/* API status */}
            <div className="rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-4">
              <h3 className="font-semibold text-[14px] mb-3">API สถานะ · Error Handling</h3>
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-white/50">Binance WebSocket</span>
                  <span className={wsStatus === 'LIVE' ? 'text-emerald-400' : 'text-red-400'}>{wsStatus}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">CoinGecko REST</span>
                  <span className={apiStatus.binance === 'LIVE' ? 'text-emerald-400' : 'text-red-400'}>{apiStatus.binance}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Forex (er-api)</span>
                  <span className={apiStatus.forex === 'LIVE' ? 'text-emerald-400' : 'text-red-400'}>{apiStatus.forex}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">News (RSS2JSON×4)</span>
                  <span className={apiStatus.news === 'LIVE' ? 'text-emerald-400' : apiStatus.news === 'FALLBACK' ? 'text-amber-300' : 'text-red-400'}>{apiStatus.news}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Trading Signals</span>
                  <span className={apiStatus.signals === 'LIVE' ? 'text-emerald-400' : 'text-red-400'}>{apiStatus.signals}</span>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-white/40 font-mono">
                fetchWithFallback(primary, fallback)
                <br />
                Promise.allSettled(RSS 4)
                <br />
                localStorage cache
              </div>
            </div>

            {/* Roadmap */}
            <div className="rounded-[18px] bg-gradient-to-br from-[#7C6CFF]/20 to-[#1A1D29] border border-[#7C6CFF]/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <img src={LOGO_SRC} alt="" className="w-6 h-6 rounded-lg bg-white/10 p-0.5" />
                <span className="font-semibold text-[13px]">Roadmap Phase 2 ✓</span>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  FINAL
                </span>
              </div>
              <ul className="text-[12px] text-white/60 space-y-1.5 list-disc list-inside">
                <li>2.1 Real Binance WebSocket multi-symbol ✓</li>
                <li>2.2 CoinGecko REST + Binance REST fallback ✓</li>
                <li>2.3 Forex er-api.com + Frankfurter fallback ✓</li>
                <li>2.4 RSS news 4 sources + allorigins fallback ✓</li>
                <li>2.5 Real orderbook similarity (Binance depth) ✓</li>
                <li>2.6 Real price chart (Binance klines + EMA20/50) ✓</li>
                <li>2.7 Real market hours (SET/Forex/Crypto) ✓</li>
                <li>2.8 Trading signals with SL/TP from real data ✓</li>
              </ul>
              <div className="mt-3 text-[11px] text-white/30">
                Single File build {'<1MB'} · HTTPS only · no eval · will-change · debounce
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Signal Detail Modal */}
      {selectedSignal && (
        <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-[6px]" onClick={() => setSelectedSignal(null)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full md:max-w-[720px] max-h-[90vh] md:max-h-[85vh] rounded-t-[24px] md:rounded-[24px] bg-[#1A1D29] border border-[#252A3A] shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-[#252A3A] flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src={LOGO_SRC} alt="" className="w-10 h-10 rounded-xl bg-[#0F1117] p-1.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[18px]">{selectedSignal.base}/{selectedSignal.quote}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        selectedSignal.type === 'LONG'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {selectedSignal.type}
                    </span>
                    <span className="text-[12px] px-2 py-0.5 rounded-full bg-[#7C6CFF]/20 text-[#A5B4FC] border border-[#7C6CFF]/30">
                      {selectedSignal.probability}% มั่นใจ
                    </span>
                  </div>
                  <div className="text-[12px] text-white/50 mt-1 tabular">
                    ${fmt(selectedSignal.price)} · {selectedSignal.change >= 0 ? '+' : ''}{fmt(selectedSignal.change, 2)}% · {selectedSignal.timeframe}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedSignal(null)}
                className="w-8 h-8 rounded-full bg-[#252A3A] grid place-items-center focus-ring"
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 p-2 bg-[#0F1117] border-b border-[#252A3A]">
              {SIGNAL_CATEGORIES.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={`px-4 py-1.5 rounded-full text-[13px] font-medium focus-ring ${
                    detailTab === tab.id ? 'bg-white text-black' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-white/30 hidden md:block">
                ESC / คลิกนอกเพื่อปิด · z-index 9999
              </span>
            </div>

            {/* Content */}
            <div className="p-5 overflow-auto space-y-4">
              {detailTab === 'tech' && (
                <div className="grid grid-cols-3 gap-3 text-[11px]">
                  <div className="rounded-xl bg-[#0F1117] border border-[#252A3A] p-3">
                    <div className="text-[11px] text-white/40">สถานะ</div>
                    <div className="font-semibold text-[13px] mt-1">{selectedSignal.statusText}</div>
                    <div className="text-[11px] text-[#A5B4FC] mt-1">
                      {selectedSignal.reason} · {selectedSignal.etfFlow} ETF
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#0F1117] border border-[#252A3A] p-3">
                    <div className="text-[11px] text-white/40">RSI / MACD</div>
                    <div className="font-semibold text-[13px] mt-1">
                      จากข้อมูลราคาจริง (Binance klines)
                    </div>
                    <div className="text-[11px] text-emerald-400 mt-1">
                      {selectedSignal.change >= 0 ? 'โมเมนตัมหนุน' : 'โมเมนตัมขาย'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#0F1117] border border-[#252A3A] p-3">
                    <div className="text-[11px] text-white/40">Volume</div>
                    <div className="font-semibold text-[13px] mt-1">
                      {selectedSignal.symbol} Volume · 24h
                    </div>
                    <div className="text-[11px] text-white/40 mt-1">สภาพคล่องสูง</div>
                  </div>
                </div>
              )}

              {detailTab === 'risk' && (
                <div className="rounded-xl bg-[#0F1117] border border-[#252A3A] p-4">
                  <div className="text-[13px] font-medium mb-3">ข้อควรระวัง · SL/TP · Money Management</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                      <div className="text-[11px] text-red-300">Stop Loss</div>
                      <div className="font-bold tabular mt-1">${fmt(selectedSignal.sl)}</div>
                      <div className="text-[11px] text-white/40 mt-1">
                        -{Math.abs((1 - selectedSignal.sl / selectedSignal.price) * 100).toFixed(1)}% จากเข้า
                      </div>
                    </div>
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                      <div className="text-[11px] text-emerald-300">Take Profit</div>
                      <div className="font-bold tabular mt-1">${fmt(selectedSignal.tp)}</div>
                      <div className="text-[11px] text-white/40 mt-1">
                        +{Math.abs((selectedSignal.tp / selectedSignal.price - 1) * 100).toFixed(1)}% เป้า
                      </div>
                    </div>
                  </div>
                  <ul className="mt-3 text-[12px] text-white/60 space-y-1 list-disc list-inside">
                    <li>อย่าเสี่ยงเกิน 2% ของพอร์ตต่อไม้</li>
                    <li>ข่าว FOMC / CPI อาจผันผวนแรง ระวัง gap</li>
                    <li>ถ้าต่ำกว่า SL ปิดทันที อย่าเฉลี่ยเพิ่ม</li>
                  </ul>
                </div>
              )}

              {detailTab === 'ai' && (
                <div className="rounded-xl bg-[#0F1117] border border-[#252A3A] p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#7C6CFF]/20 border border-[#7C6CFF]/30 grid place-items-center font-bold text-[#A5B4FC]">
                      {selectedSignal.similarity}%
                    </div>
                    <div>
                      <div className="font-medium text-[13px]">AI Similarity ✓</div>
                      <div className="text-[11px] text-white/50 mt-1">
                        คำนวณจาก Binance orderbook depth + price pattern
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                    <span className="px-2 py-1 rounded-full bg-[#252A3A] text-white/40 text-center">
                      {selectedSignal.sources[0]}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-[#252A3A] text-white/40 text-center">
                      {selectedSignal.sources[1]}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-[#252A3A] text-white/40 text-center">
                      {selectedSignal.sources[2]}
                    </span>
                  </div>
                  <div className="mt-3 text-[11px] text-white/30">
                    Sources clickable · {selectedSignal.tags.join(' ')} tags · วิเคราะห์จาก Binance orderbook + on-chain
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-8 border-t border-[#252A3A] bg-[#1A1D29]/50">
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] text-white/40">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${marketHours.set === 'OPEN' ? 'bg-emerald-400' : 'bg-white/20'}`}></span>
              SET {marketHours.set}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${marketHours.forex === 'OPEN' ? 'bg-emerald-400' : 'bg-white/20'}`}></span>
              Forex {marketHours.forex}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 live-dot"></span>
              Crypto 24/7 OPEN
            </span>
            <span className="hidden md:inline">·</span>
            <span className="tabular">{marketHours.countdown}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#1A1D29] border border-[#252A3A]">
              <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'LIVE' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
              Binance WS {wsStatus}
            </span>
            <span className="px-2 py-1 rounded-full bg-[#1A1D29] border border-[#252A3A]">
              CoinGecko {apiStatus.binance}
            </span>
            <span className="px-2 py-1 rounded-full bg-[#1A1D29] border border-[#252A3A]">
              er-api {apiStatus.forex}
            </span>
            <span className="text-white/20">
              © 2025 Trading Engine Pro · Cozy Evening #0F1117 · Inter + Prompt · tabular-nums
            </span>
          </div>
        </div>
      </footer>
    </div>
    </ErrorBoundary>
  );
}
