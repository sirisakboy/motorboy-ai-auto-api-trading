package com.example.model

enum class FlashDirection { UP, DOWN, NONE }
enum class Sentiment { BULLISH, BEARISH, NEUTRAL }
enum class MarketStatus { OPEN, CLOSED }

data class CryptoCoin(
    val id: String,
    val symbol: String,
    val name: String,
    val binanceSymbol: String,
    val price: Double = 0.0,
    val change: Double = 0.0,
    val prevPrice: Double = 0.0,
    val marketCap: Double? = null,
    val high: Double = 0.0,
    val low: Double = 0.0,
    val volume: Double = 0.0,
    val flash: FlashDirection = FlashDirection.NONE
)

data class ForexPair(
    val pair: String,
    val price: Double = 0.0,
    val change: Double = 0.0,
    val flash: FlashDirection = FlashDirection.NONE
)

data class StockIndex(
    val symbol: String,
    val name: String,
    val price: Double = 0.0,
    val change: Double = 0.0,
    val status: MarketStatus = MarketStatus.CLOSED,
    val schedule: String = ""
)

data class TradingSignal(
    val id: String,
    val symbol: String,
    val base: String,
    val quote: String = "USDT",
    val type: String, // "LONG" or "SHORT"
    val probability: Int, // e.g. 78%
    val timeframe: String, // e.g. "สั้น 1-7วัน"
    val price: Double,
    val change: Double,
    val statusText: String,
    val reason: String,
    val sources: List<String>,
    val tags: List<String>,
    val sl: Double,
    val tp: Double,
    val similarity: Int,
    val etfFlow: String
)

data class NewsArticle(
    val id: String,
    val title: String,
    val source: String,
    val time: String,
    val url: String,
    val sentiment: Sentiment = Sentiment.NEUTRAL
)

data class MarketHoursInfo(
    val setStatus: MarketStatus = MarketStatus.CLOSED,
    val forexStatus: MarketStatus = MarketStatus.OPEN,
    val cryptoStatus: MarketStatus = MarketStatus.OPEN,
    val countdown: String = "",
    val timestamp: String = ""
)

data class ChartData(
    val prices: List<Double> = emptyList(),
    val ema20: List<Double> = emptyList(),
    val ema50: List<Double> = emptyList()
)

data class ApiStatusState(
    val binanceWs: String = "CONNECTING",
    val coinGecko: String = "LIVE",
    val forex: String = "LIVE",
    val news: String = "LIVE",
    val signals: String = "LIVE",
    val stocks: String = "LIVE"
)
