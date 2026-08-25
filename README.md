# Trading Engine Pro (Android)

A real-time multi-asset financial trading engine, market monitoring, and AI signal analysis application built with **Kotlin** and **Jetpack Compose**.

## Features

- **Live Crypto Streaming**: Real-time ticker streaming via Binance WebSocket (`wss://stream.binance.com:9443/ws/...`) with automatic reconnection and CoinGecko REST fallback.
- **Forex Rates**: Live exchange rates via `open.er-api.com` with Frankfurter REST fallback and real-time flash indicators.
- **SET & Global Stock Indices**: Thailand SET market hours calculation (Asia/Bangkok ICT UTC+7 10:00-12:30, 14:30-16:30), US market indices (NASDAQ, S&P 500, Dow Jones), and live countdown clocks.
- **Real-Time News Feed**: Aggregated multi-source RSS feeds (CoinDesk, Cointelegraph, Decrypt, The Block) with keyword-based sentiment analysis (Bullish, Bearish, Neutral).
- **90-Day EMA Price Charts**: Interactive Canvas chart rendering real Binance daily candlestick history with calculated EMA(20) and EMA(50) moving averages.
- **AI Signal Analysis & Risk Management**:
  - Technical indicators (RSI momentum, 24h liquidity volume, ETF net flow)
  - Risk & Money management calculator with calculated Stop Loss (SL) and Take Profit (TP) target levels adhering to the 2% portfolio risk rule
  - AI Similarity pattern scoring computed from orderbook depth and volume metrics
- **Interactive Watchlist & Alerts**: Star items for quick watchlist filtering and custom target price alerts.
- **Currency & Theme Switching**: Support for USD / THB pricing and dark / light Material 3 design system.

## Technology Stack

- **Platform**: Android SDK 36 (Min SDK 26)
- **Language**: Kotlin 2.0.21
- **UI Framework**: Jetpack Compose (Material Design 3)
- **Networking**: OkHttp 4.12.0 (WebSocket + REST) & Kotlinx Serialization
- **Architecture**: MVVM with Coroutines & StateFlow
