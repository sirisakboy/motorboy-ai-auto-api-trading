import React, { useEffect, useState } from 'react';
import {
  Check,
  Download,
  RefreshCw,
} from 'lucide-react';
import {
  type DailyCsvDataset,
  type DailySnapshotDateItem,
  downloadDailyCsvExport,
  fetchArchivedDailyDates,
  triggerDailySnapshotNow,
} from '../services/dailyCsvExportService';

interface DailyCsvExportPanelProps {
  defaultAsset?: string;
}

const QUICK_ASSET_OPTIONS = [
  'ALL',
  'BTC',
  'ETH',
  'SOL',
  'NVDA',
  'AAPL',
  'TSLA',
  'AOT',
  'DELTA',
  'PTT',
  'SET',
  'USD/THB',
  'EUR/USD',
  'GOLD',
];

function getArchivePreviewPath(dataset: DailyCsvDataset, customSubpath: string): string {
  const folderMap: Record<DailyCsvDataset, string> = {
    combined: 'MotorBoy-AI-TH-Archive/daily-csv/combined-backtest',
    prices: 'MotorBoy-AI-TH-Archive/daily-csv/prices',
    news: 'MotorBoy-AI-TH-Archive/daily-csv/news',
  };
  const cleanSub = customSubpath
    .split('/')
    .map((s) => s.replace(/[^A-Za-z0-9._\-\s]/g, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('/');
  return cleanSub ? `${folderMap[dataset]} (${cleanSub})` : folderMap[dataset];
}

export const DailyCsvExportPanel: React.FC<DailyCsvExportPanelProps> = ({
  defaultAsset = 'ALL',
}) => {
  const normalizedDefault =
    defaultAsset && defaultAsset !== 'ALL' ? defaultAsset.split('/')[0].toUpperCase() : 'ALL';

  const [dates, setDates] = useState<DailySnapshotDateItem[]>([]);
  const [loadingDates, setLoadingDates] = useState<boolean>(true);
  const [selectedDateKey, setSelectedDateKey] = useState<string>('ALL');
  const [selectedDataset, setSelectedDataset] = useState<DailyCsvDataset>('combined');
  const [selectedAsset, setSelectedAsset] = useState<string>(
    QUICK_ASSET_OPTIONS.includes(normalizedDefault) ? normalizedDefault : 'ALL'
  );
  const [customSubpath, setCustomSubpath] = useState<string>('');

  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isSnapshotting, setIsSnapshotting] = useState<boolean>(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDates = async () => {
    setLoadingDates(true);
    try {
      const items = await fetchArchivedDailyDates();
      setDates(items);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'ไม่สามารถโหลดวันที่บันทึกได้');
    } finally {
      setLoadingDates(false);
    }
  };

  useEffect(() => {
    void loadDates();
  }, []);

  const handleRecordToday = async () => {
    setIsSnapshotting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await triggerDailySnapshotNow(false);
      await loadDates();
      setStatusMessage('บันทึกข้อมูลราคาและข่าววันนี้เรียบร้อยแล้ว');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setIsSnapshotting(false);
    }
  };

  const handleDownloadCsv = async () => {
    setIsDownloading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await downloadDailyCsvExport({
        dateKey: selectedDateKey,
        dataset: selectedDataset,
        asset: selectedAsset,
        customSubpath,
      });
      setStatusMessage(
        `ดาวน์โหลด ${res.fileName} สำเร็จ (${res.rowCount.toLocaleString()} แถว)`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'ดาวน์โหลด CSV ไม่สำเร็จ');
    } finally {
      setIsDownloading(false);
    }
  };

  const totalAssetsLatest = dates[0]?.assetCount ?? 0;
  const totalNewsLatest = dates[0]?.newsCount ?? 0;

  return (
    <section
      aria-label="Daily Price and News CSV Export"
      className="p-4 sm:p-5 rounded-xl bg-[#141725] border border-white/[0.07] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-white">
            Export Daily Price &amp; News CSV (Backtest Portability)
          </h4>
          <p className="text-xs text-[#A7A4B8] font-mono tabular-nums">
            {loadingDates
              ? 'กำลังโหลดรายการวันที่ที่บันทึกไว้...'
              : dates.length > 0
              ? `บันทึกแล้ว ${dates.length} วัน · ล่าสุด ${dates[0].dateKey} (${totalAssetsLatest} สินทรัพย์ · ${totalNewsLatest} ข่าว)`
              : 'ยังไม่มีข้อมูลรายวันที่บันทึกไว้'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRecordToday}
            disabled={isSnapshotting}
            className="px-3 py-1.5 rounded-lg bg-[#222640] hover:bg-[#2C3152] border border-white/[0.08] text-xs font-medium text-[#ECEAF4] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSnapshotting ? 'animate-spin' : ''}`} />
            <span>{isSnapshotting ? 'กำลังบันทึก...' : 'อัปเดตข้อมูลวันนี้'}</span>
          </button>
        </div>
      </div>

      {!loadingDates && dates.length === 0 ? (
        <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-[#A7A4B8]">
            กดบันทึกข้อมูลวันนี้เพื่อสร้างสแนปช็อตราคาสินทรัพย์และข่าวการเงินสำหรับส่งออกเป็น CSV
          </p>
          <button
            type="button"
            onClick={handleRecordToday}
            disabled={isSnapshotting}
            className="px-4 py-2 rounded-lg bg-[#7EE0B5] text-[#0F1117] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            บันทึกข้อมูลวันนี้
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
            <div className="space-y-1">
              <label htmlFor="csv-date-select" className="block text-[11px] text-[#A7A4B8]">
                ช่วงวันที่ (Date Snapshot)
              </label>
              <select
                id="csv-date-select"
                value={selectedDateKey}
                onChange={(e) => setSelectedDateKey(e.target.value)}
                className="w-full bg-[#0F1117] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-xs tabular-nums outline-none focus:border-[#7C6CFF]"
              >
                <option value="ALL">ทุกวันที่มีข้อมูล ({dates.length} วัน)</option>
                {dates.map((d) => (
                  <option key={d.dateKey} value={d.dateKey}>
                    {d.dateKey} ({d.assetCount} สินทรัพย์ · {d.newsCount} ข่าว)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="csv-dataset-select" className="block text-[11px] text-[#A7A4B8]">
                รูปแบบตาราง CSV (Dataset)
              </label>
              <select
                id="csv-dataset-select"
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value as DailyCsvDataset)}
                className="w-full bg-[#0F1117] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-[#7C6CFF]"
              >
                <option value="combined">Combined Price + News (Backtest Join)</option>
                <option value="prices">Daily Asset Prices &amp; Volatility</option>
                <option value="news">Daily Classified News Headlines</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="csv-asset-select" className="block text-[11px] text-[#A7A4B8]">
                กรองสินทรัพย์ (Asset Filter)
              </label>
              <select
                id="csv-asset-select"
                value={selectedAsset}
                onChange={(e) => setSelectedAsset(e.target.value)}
                className="w-full bg-[#0F1117] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-[#7C6CFF]"
              >
                {QUICK_ASSET_OPTIONS.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym === 'ALL' ? 'ทุกสินทรัพย์ (All Assets)' : sym}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="csv-archive-subfolder" className="block text-[11px] text-[#A7A4B8]">
                โฟลเดอร์ย่อย (ไม่บังคับ)
              </label>
              <input
                id="csv-archive-subfolder"
                type="text"
                value={customSubpath}
                onChange={(e) => setCustomSubpath(e.target.value)}
                placeholder="เช่น batch-q4 หรือ strategy-a"
                maxLength={48}
                className="w-full bg-[#0F1117] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-xs placeholder-[#6C6982] outline-none focus:border-[#7EE0B5]"
              />
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-white/[0.07]">
            <div className="text-xs text-[#A7A4B8] font-mono">
              Archive Path: <span className="text-[#ECEAF4]">{getArchivePreviewPath(selectedDataset, customSubpath)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={isDownloading}
                className="px-4 py-2 rounded-lg bg-[#7C6CFF] hover:bg-[#6E5DFF] text-xs font-semibold text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-[#7EE0B5]" />
                <span>{isDownloading ? 'กำลังสร้าง CSV...' : 'ดาวน์โหลด CSV'}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {statusMessage && (
        <div className="text-xs font-mono text-[#7EE0B5] flex items-center gap-1.5 pt-1">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="text-xs font-mono text-[#F4A6A6] pt-1">
          ข้อผิดพลาด: {errorMessage}
        </div>
      )}
    </section>
  );
};
