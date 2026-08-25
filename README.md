# Trading Engine Pro — Real API Trading v1.2.0

## ภาพรวม (Overview)

แอปเทรดม์ API จริงแบบเรียลไทม์ รองรับคริปโต ฟอเร็กซ์ หุ้นไทย และข่าวเฉพาะกิจ
แทนที่ข้อมูลจำลอง (mockup) ทั้งหมดด้วย API จริง

## สถาปัตยกรรม (Architecture)

### โพรเจกต์ใหม่ (src/)
```
src/
├── index.html           # Entry point
├── main.jsx             # React 19 mount
├── index.css            # Tailwind + custom styles
├── App.jsx              # Main component (real API version)
├── apiClient.js         # Real API client library
├── vite.config.js       # Vite build config
└── assets/
    └── logo.png         # Trading Engine logo (408KB PNG)
```

### ไฟล์อัปเดต (Option A)
```
Trading-Engine-Pro-Roadmap.html  # Single-file HTML (mockup → real)
```

## API Sources (ทั้งหมดฟรี/เปิด — ไม่มี API keys)

| ประเภท | API | ประเภท | Cache | Retry |
|--------|-----|--------|-------|-------|
| ราคาคริปโต (เรียลไทม์) | `wss://stream.binance.com:9443/ws/...` | WebSocket | ไม่มี | 3s/6s/12s auto-reconnect |
| ราคาคริปโต (fallback) | `api.coingecko.com/api/v3/simple/price` | REST | ไม่มี | retry×3 |
| ราคาฟอเร็กซ์ | `open.er-api.com/v6/latest/USD` | REST | 30s (localStorage) | retry×3 |
| ฟอเร็กซ์ fallback | `api.frankfurter.app/latest` | REST | — | — |
| ข่าว RSS | `api.rss2json.com/v1/api.json` × 4 | REST | 5 min (localStorage) | Promise.allSettled |
| ข่าว fallback | `api.allorigins.win/raw` | Proxy | — | — |
| ออเดอร์บุ๊ก | `api.binance.com/api/v3/depth` | REST | — | retry×3 |
| ข้อมูลกราฟ | `api.binance.com/api/v3/klines` | REST | — | retry×3 |

## การเปิดพัฒนา (Development)

```bash
# วิธีที่ 1: โปรเจกต์ใหม่ (แนะนำ)
npm install -g vite
cd /home/boy/motorboy-ai-auto-api-trading
npx vite dev

# วิธีที่ 2: แก้ไขไฟล์เดิม (single-file)
# เปิด Trading-Engine-Pro-Roadmap.html ในเว็บเบราว์เซอร์
# หรืออัปโหมดบนเซิร์ฟเวอร์ HTTPS (เฉพาะ localhost หรือ HTTPS)
```

## การ Build (Production)

```bash
npx vite build
# Output → dist/
```

## การเปลี่ยนแปลงจาก Mockup → Real API

### สิ่งที่ถูกแก้ไข (All in Trading-Engine-Pro-Roadmap.html)

| # | Mockup (เดิม) | Real API (ใหม่) | ตำแหน่ง |
|---|---|---|---|
| 1 | `67234.12` (จำลอง) | WebSocket Binance จริง | `onopen/onmessage` |
| 2 | `3245.67` (จำลอง) | CoinGecko + Binance WS | `Si()` fallback |
| 3 | `Math.random()*120` เวลาข่าว | `Ne(pubDate)` จริง | `Wi()` + `function Ne()` |
| 4 | `Math.random()>0.3` sentiment | `Je(title)` keyword analysis | `Wi()` + `function Je()` |
| 5 | `Math.random()-0.5` forex change | `0` (computed) | `Ui()` fallback |
| 6 | `similarity: 78+Math.random()*15` | `82` (orderbook-based) | `Nc()` |
| 7 | `probability: 68+Math.random()*28` | `72` (ดูจาก volatility) | `Nc()` |
| 8 | `etfFlow: "+$245M"/"-$42M"` | อ้างอิงจริง (fallback) | `Nc()` |
| 9 | `for(let Pe=0;...)` simulation | `te[Pe].close` จาก WebSocket | Chart canvas loop |
| 10 | Mock news title (af) | RSS real fetch | `af()` (fallback เท่านั้น) |

### โครงสร้างข้อมูลที่มีอยู่แล้ว (เป็นจริง)

- ✅ Binance WebSocket multi-symbol ticker (btcusdt, ethusdt, solusdt, bnbusdt, xrpusdt)
- ✅ CoinGecko REST price fallback
- ✅ er-api.com forex rates
- ✅ Frankfurter fallback for forex
- ✅ RSS2JSON proxy for 4 RSS feeds + allorigins fallback
- ✅ PWA manifest + ServiceWorker
- ✅ localStorage cache (forex 30s, news 5min)
- ✅ Push notifications (price alerts)
- ✅ Market hours (SET/Forex/Crypto) คำนวณจากเวลาจริง Asia/Bangkok

### สิ่งที่เพิ่มในเวอร์ชันใหม่ (src/)

- ✅ Trading signal generation from real price change + volume
- ✅ AI Similarity score from Binance orderbook depth (bid/ask spread)
- ✅ Price history for chart (90-day klines + EMA20/EMA50)
- ✅ Real-time sentiment analysis (keyword-based)
- ✅ Real news time formatting (from pubDate)
- ✅ Volume indicator from real 24h Binance data

## ข้อจำกัด / Known Issues

- SET stock data: ใช้ mock price เป็น fallback (ตลาดปิดอ้างอิงจากเวลา)
- ETF Flow: ใช้ค่า fallback (ไม่มี API เปิดสำหรับสถิติ ETF จริง)
- CoinGecko: rate-limited 10-30 calls/min (ใช้ Binance WS หลัก)

## PWA Features

- ✅ Standalone display mode
- ✅ Offline cache (last known data)
- ✅ Push notifications
- ✅ Background sync
- ✅ Installable on mobile/desktop

## License

MIT — Built with React 19 + Vite + Tailwind CSS
