import React, { useState } from 'react';
import {
  Activity,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ChevronDown,
  ChevronUp,
  Cpu,
  Globe,
  Database,
  ArrowRightLeft,
  Flame,
} from 'lucide-react';
import { ApiStatusState } from '../types';

interface ApiStatusCardProps {
  status: ApiStatusState;
  onRefresh?: () => void;
}

interface ServiceMeta {
  key: keyof ApiStatusState;
  label: string;
  source: string;
  failover: string;
  type: string;
}

const SERVICE_CONFIGS: ServiceMeta[] = [
  {
    key: 'binanceWs',
    label: 'Binance WebSocket',
    source: 'wss://stream.binance.com:9443 (5 Symbols)',
    failover: 'Auto-reconnect (Backoff 5-30s) + REST Fallback ทันที',
    type: 'WebSocket Live Stream',
  },
  {
    key: 'coinGecko',
    label: 'CoinGecko & Binance REST',
    source: 'api.coingecko.com / api.binance.com 24hr',
    failover: 'Dual-host failover, AbortSignal 6s timeout, Zero-freeze',
    type: 'REST Fallback Poll (30s)',
  },
  {
    key: 'forex',
    label: 'Forex Rates (er-api + ECB)',
    source: 'open.er-api.com / api.frankfurter.app',
    failover: 'Multi-pair parallel promise, ECB fallback, Stale cache',
    type: 'FX Rest Polling (15s)',
  },
  {
    key: 'stocks',
    label: 'Indices & Stocks (Yahoo Finance)',
    source: 'query1 ➔ query2 ➔ allorigins CORS Proxy',
    failover: 'Triple-mirror failover, Rate-limit bypass, Zero fake data',
    type: 'Stock & Index Quotes (60s)',
  },
  {
    key: 'news',
    label: 'News Feeds (RSS 10 + Mitrade)',
    source: '10 Global & TH RSS + Jina Mitrade Insights',
    failover: 'Parallel race, SHA hash dedup, Permanent Curated pool',
    type: 'News Aggregator (300s)',
  },
  {
    key: 'signals',
    label: 'Quantitative Signals Engine',
    source: 'Real-time Math Engine (EMA20/50 + Volatility SL/TP)',
    failover: 'คำนวณสดจากราคาจริงทุก 15s ป้องกัน Signal Flapping',
    type: 'In-Memory Quant Analysis',
  },
];

export const ApiStatusCard: React.FC<ApiStatusCardProps> = ({ status, onRefresh }) => {
  const [showDetails, setShowDetails] = useState<boolean>(false);

  // Compute live services count
  const allStates = [
    status.binanceWs,
    status.coinGecko,
    status.forex,
    status.stocks,
    status.news,
    status.signals,
  ];

  const liveCount = allStates.filter((s) => s === 'LIVE' || s === 'ONLINE').length;
  const fallbackCount = allStates.filter(
    (s) => s === 'FALLBACK' || s === 'CURATED' || s === 'STALE'
  ).length;
  const totalCount = allStates.length;

  return (
    <div className="w-full rounded-[20px] bg-[#1A1D29] border border-[#2A2E45] p-4 shadow-xl relative overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#2A2E45]/70">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#7C6CFF]/15 border border-[#7C6CFF]/30 flex items-center justify-center text-[#A5B4FC]">
            <Activity className="w-4 h-4 text-[#7C6CFF]" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm tracking-tight flex items-center gap-1.5">
              API สถานะ • Error Handling
            </h3>
            <p className="text-[10px] text-[#9CA3AF]">
              ระบบตรวจสอบและกู้คืนการเชื่อมต่ออัตโนมัติ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Counter Badge */}
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
              liveCount === totalCount
                ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]'
                : liveCount + fallbackCount === totalCount
                ? 'bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#FBBF24]'
                : 'bg-[#f9df7b]/15 border-[#f9df7b]/40 text-[#f9df7b]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                liveCount === totalCount
                  ? 'bg-[#4ADE80] animate-pulse'
                  : liveCount + fallbackCount === totalCount
                  ? 'bg-[#FBBF24]'
                  : 'bg-[#f9df7b]'
              }`}
            />
            {liveCount}/{totalCount} ONLINE
          </span>

          {/* Manual Refresh / Re-test Button */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={status.isChecking}
              title="ทดสอบและรีเฟรชการเชื่อมต่อ API ทั้งหมดทันที"
              className="p-1.5 rounded-lg bg-[#2A2E45]/60 hover:bg-[#2A2E45] border border-[#343B4E] text-[#9CA3AF] hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${status.isChecking ? 'animate-spin text-[#7C6CFF]' : ''}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Service Rows */}
      <div className="mt-3 space-y-2">
        {SERVICE_CONFIGS.map((svc) => {
          const stateVal = (status[svc.key] as string) || 'OFFLINE';
          return (
            <div
              key={svc.key}
              className="group p-2 rounded-xl bg-[#131622]/60 hover:bg-[#131622] border border-[#2A2E45]/40 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <ServiceIcon type={svc.key} />
                  <div className="truncate">
                    <span className="text-white text-xs font-semibold block truncate">
                      {svc.label}
                    </span>
                    <span className="text-[#909AAB] text-[10px] block font-mono truncate">
                      {svc.type}
                    </span>
                  </div>
                </div>

                <StatusBadge state={stateVal} />
              </div>

              {/* Expandable or sub detail line */}
              {showDetails && (
                <div className="mt-1.5 pt-1.5 border-t border-[#2A2E45]/40 text-[10px] space-y-0.5">
                  <div className="text-[#9CA3AF] flex items-center justify-between">
                    <span className="text-[#909AAB]">Endpoint:</span>
                    <span className="font-mono text-[#D1D5DB] truncate max-w-[200px]">
                      {svc.source}
                    </span>
                  </div>
                  <div className="text-[#9CA3AF] flex items-center justify-between">
                    <span className="text-[#909AAB]">Failover:</span>
                    <span className="text-[#A5B4FC] truncate max-w-[200px]">
                      {svc.failover}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Toggle Details & Last Checked Time */}
      <div className="mt-3 pt-2.5 border-t border-[#2A2E45]/60 flex items-center justify-between text-[10px]">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-[#9CA3AF] hover:text-[#A5B4FC] transition-colors inline-flex items-center gap-1 font-medium"
        >
          {showDetails ? (
            <>
              <ChevronUp className="w-3 h-3" />
              <span>ซ่อนรายละเอียดสถาปัตยกรรม</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              <span>ดูสถาปัตยกรรม Failover & Endpoints</span>
            </>
          )}
        </button>

        <span className="text-[#909AAB] font-mono">
          {status.lastChecked ? `อัปเดต: ${status.lastChecked}` : 'พร้อมทำงาน 100%'}
        </span>
      </div>

      {/* Fault Tolerance Architecture Summary (When Expanded) */}
      {showDetails && (
        <div className="mt-3 p-2.5 rounded-xl bg-[#0D1017] border border-[#2A2E45] text-[11px] space-y-2">
          <div className="flex items-center gap-1.5 text-white font-bold text-xs pb-1 border-b border-[#2A2E45]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
            <span>กลยุทธ์รับมือข้อผิดพลาด (Fault-Tolerance)</span>
          </div>

          <div className="space-y-1.5 text-[10px] text-[#9CA3AF]">
            <div className="flex items-start gap-1.5">
              <span className="text-[#4ADE80] font-bold">1.</span>
              <span>
                <strong className="text-white">Auto-Reconnect:</strong> WebSocket ตัดการเชื่อมต่อจะต่อใหม่อัตโนมัติด้วย Exponential Backoff (5s→10s→20s→30s) และสลับดึง REST ทันที
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-[#A5B4FC] font-bold">2.</span>
              <span>
                <strong className="text-white">Triple-Mirror Failover:</strong> ข้อมูลหุ้นและดัชนีวิ่งผ่าน query1 ➔ query2 ➔ CORS Proxy เพื่อเลี่ยงปัญหา Rate-Limit 429
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-[#FBBF24] font-bold">3.</span>
              <span>
                <strong className="text-white">Stale-State Protection:</strong> หากเครือข่ายหลุด ระบบจะคงราคาเดิมพร้อมป้ายสถานะ ไม่สุ่มตัวเลขจำลองหลอกผู้ใช้
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-[#38BDF8] font-bold">4.</span>
              <span>
                <strong className="text-white">News Resilient Race:</strong> ดึงข่าว 10 แหล่งพร้อมกัน และมีพูลบทวิเคราะห์สำรอง จึงไม่มีวันเกิดหน้าข่าวว่างเปล่า
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ServiceIcon: React.FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case 'binanceWs':
      return <Radio className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />;
    case 'coinGecko':
      return <Database className="w-3.5 h-3.5 text-[#10B981] shrink-0" />;
    case 'forex':
      return <ArrowRightLeft className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />;
    case 'stocks':
      return <Globe className="w-3.5 h-3.5 text-[#EC4899] shrink-0" />;
    case 'news':
      return <Flame className="w-3.5 h-3.5 text-[#F97316] shrink-0" />;
    default:
      return <Cpu className="w-3.5 h-3.5 text-[#A5B4FC] shrink-0" />;
  }
};

const StatusBadge: React.FC<{ state: string }> = ({ state }) => {
  const isLive = state === 'LIVE' || state === 'ONLINE';
  const isConnecting = state === 'CONNECTING' || state === 'SYNCING';
  const isFallback = state === 'FALLBACK' || state === 'CURATED' || state === 'STALE';

  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80] text-[10px] font-bold shrink-0">
        <CheckCircle2 className="w-3 h-3 text-[#22C55E]" />
        <span>LIVE</span>
      </span>
    );
  }

  if (isConnecting) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#6366F1]/15 border border-[#6366F1]/40 text-[#A5B4FC] text-[10px] font-bold shrink-0">
        <RefreshCw className="w-3 h-3 animate-spin text-[#A5B4FC]" />
        <span>CONNECTING</span>
      </span>
    );
  }

  if (isFallback) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#FBBF24] text-[10px] font-bold shrink-0">
        <ShieldCheck className="w-3 h-3 text-[#F59E0B]" />
        <span>{state}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#f9df7b]/15 border border-[#f9df7b]/40 text-[#f9df7b] text-[10px] font-bold shrink-0">
      <AlertTriangle className="w-3 h-3 text-[#f9df7b]" />
      <span>{state}</span>
    </span>
  );
};

export const RoadmapCard: React.FC = () => {
  const items = [
    '2.1 Real Binance WebSocket multi-symbol ✓',
    '2.2 CoinGecko REST + Binance REST fallback ✓',
    '2.3 Forex er-api.com + Frankfurter fallback ✓',
    '2.4 RSS news 10 sources (crypto/Yahoo/BBC/CNBC/TH) rss2json+proxy race ✓',
    '2.5 Momentum score from real 24h price change ✓',
    '2.6 Price chart (Binance klines + EMA; Forex & Stocks Yahoo/Frankfurter live, no simulation) ✓',
    '2.7 Real market hours (SET/Forex/Crypto) ✓',
    '2.8 Signals with volatility-adaptive SL/TP ✓',
    '2.9 Indices/Stocks Yahoo query1→query2→proxy chain ✓',
  ];

  return (
    <div className="w-full rounded-[18px] bg-[#1A1D29] border border-[#7C6CFF]/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold text-xs">
          Roadmap Phase 2 Live ✓
        </h3>
        <span className="bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80] text-[10px] font-bold px-2 py-0.5 rounded-xl">
          FINAL
        </span>
      </div>

      <div className="mt-2.5 space-y-1">
        {items.map((item) => (
          <p key={item} className="text-[#9CA3AF] text-[11px] leading-snug">
            • {item}
          </p>
        ))}
      </div>
    </div>
  );
};
