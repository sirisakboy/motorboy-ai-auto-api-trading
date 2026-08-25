package com.example.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.model.*
import com.example.network.ApiClient
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.WebSocket

class TradingViewModel : ViewModel() {

    private val _cryptoList = MutableStateFlow(ApiClient.CRYPTO_INITIAL)
    val cryptoList: StateFlow<List<CryptoCoin>> = _cryptoList.asStateFlow()

    private val _forexList = MutableStateFlow<List<ForexPair>>(emptyList())
    val forexList: StateFlow<List<ForexPair>> = _forexList.asStateFlow()

    private val _stockList = MutableStateFlow(ApiClient.STOCK_SYMBOLS)
    val stockList: StateFlow<List<StockIndex>> = _stockList.asStateFlow()

    private val _signalsList = MutableStateFlow<List<TradingSignal>>(emptyList())
    val signalsList: StateFlow<List<TradingSignal>> = _signalsList.asStateFlow()

    private val _newsList = MutableStateFlow<List<NewsArticle>>(emptyList())
    val newsList: StateFlow<List<NewsArticle>> = _newsList.asStateFlow()

    private val _marketHours = MutableStateFlow(ApiClient.computeMarketHours())
    val marketHours: StateFlow<MarketHoursInfo> = _marketHours.asStateFlow()

    private val _apiStatus = MutableStateFlow(ApiStatusState())
    val apiStatus: StateFlow<ApiStatusState> = _apiStatus.asStateFlow()

    private val _activeTab = MutableStateFlow("crypto") // "crypto", "forex", "stocks", "watchlist"
    val activeTab: StateFlow<String> = _activeTab.asStateFlow()

    private val _minProbability = MutableStateFlow(55)
    val minProbability: StateFlow<Int> = _minProbability.asStateFlow()

    private val _searchTerm = MutableStateFlow("")
    val searchTerm: StateFlow<String> = _searchTerm.asStateFlow()

    private val _watchlist = MutableStateFlow<Set<String>>(setOf("BTC", "ETH"))
    val watchlist: StateFlow<Set<String>> = _watchlist.asStateFlow()

    private val _selectedSignal = MutableStateFlow<TradingSignal?>(null)
    val selectedSignal: StateFlow<TradingSignal?> = _selectedSignal.asStateFlow()

    private val _chartData = MutableStateFlow<ChartData?>(null)
    val chartData: StateFlow<ChartData?> = _chartData.asStateFlow()

    private val _isChartLoading = MutableStateFlow(false)
    val isChartLoading: StateFlow<Boolean> = _isChartLoading.asStateFlow()

    private val _useThbCurrency = MutableStateFlow(false)
    val useThbCurrency: StateFlow<Boolean> = _useThbCurrency.asStateFlow()

    private val _isDarkTheme = MutableStateFlow(true)
    val isDarkTheme: StateFlow<Boolean> = _isDarkTheme.asStateFlow()

    private val _isSettingsOpen = MutableStateFlow(false)
    val isSettingsOpen: StateFlow<Boolean> = _isSettingsOpen.asStateFlow()

    private val _notificationsEnabled = MutableStateFlow(false)
    val notificationsEnabled: StateFlow<Boolean> = _notificationsEnabled.asStateFlow()

    private val _priceAlerts = MutableStateFlow<Map<String, Double>>(emptyMap())
    val priceAlerts: StateFlow<Map<String, Double>> = _priceAlerts.asStateFlow()

    private var binanceWs: WebSocket? = null

    // Filtered signals derived state
    val filteredSignals: StateFlow<List<TradingSignal>> = combine(
        _signalsList,
        _minProbability,
        _searchTerm,
        _activeTab,
        _watchlist
    ) { signals, minProb, term, tab, watch ->
        var list = signals.filter { it.probability >= minProb }
        if (term.isNotBlank()) {
            val q = term.trim().lowercase()
            list = list.filter { it.symbol.lowercase().contains(q) || it.base.lowercase().contains(q) }
        }
        if (tab == "watchlist") {
            list = list.filter { watch.contains(it.symbol) }
        }
        list
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        initWebSocket()
        initRestPolling()
        initClock()
        // Select BTC for default chart
        loadChart("bitcoin")
    }

    private fun initWebSocket() {
        binanceWs = ApiClient.startBinanceWebSocket(
            onUpdate = { updatedCoin ->
                _cryptoList.update { currentList ->
                    currentList.map { coin ->
                        if (coin.binanceSymbol.equals(updatedCoin.binanceSymbol, ignoreCase = true)) {
                            val flash = when {
                                updatedCoin.price > coin.price && coin.price > 0.0 -> FlashDirection.UP
                                updatedCoin.price < coin.price && coin.price > 0.0 -> FlashDirection.DOWN
                                else -> FlashDirection.NONE
                            }
                            updatedCoin.copy(flash = flash, prevPrice = coin.price)
                        } else {
                            coin
                        }
                    }
                }
            },
            onStatus = { status ->
                _apiStatus.update { it.copy(binanceWs = status) }
            }
        )
    }

    private fun initRestPolling() {
        // Initial REST fetch & periodic refreshes
        viewModelScope.launch {
            // Initial crypto REST
            val coins = ApiClient.fetchCryptoPrices()
            _cryptoList.value = coins
            val signals = ApiClient.generateRealSignals(coins)
            _signalsList.value = signals

            // Initial Forex
            val forex = ApiClient.fetchForexRates()
            _forexList.value = forex

            // Initial News
            val news = ApiClient.fetchNews()
            _newsList.value = news
        }

        // Loop for forex and signals update
        viewModelScope.launch {
            while (isActive) {
                delay(15000)
                try {
                    val forex = ApiClient.fetchForexRates(_forexList.value)
                    _forexList.value = forex
                    _apiStatus.update { it.copy(forex = "LIVE") }
                } catch (_: Exception) {
                    _apiStatus.update { it.copy(forex = "FALLBACK") }
                }
            }
        }

        // Signals regeneration loop
        viewModelScope.launch {
            _cryptoList.collect { coins ->
                if (coins.any { it.price > 0.0 }) {
                    val sigs = ApiClient.generateRealSignals(coins)
                    _signalsList.value = sigs
                }
            }
        }

        // News 5-minute refresh
        viewModelScope.launch {
            while (isActive) {
                delay(300000)
                try {
                    val news = ApiClient.fetchNews()
                    if (news.isNotEmpty()) {
                        _newsList.value = news
                        _apiStatus.update { it.copy(news = "LIVE") }
                    }
                } catch (_: Exception) {}
            }
        }
    }

    private fun initClock() {
        viewModelScope.launch {
            while (isActive) {
                _marketHours.value = ApiClient.computeMarketHours()
                delay(1000)
            }
        }
    }

    fun loadChart(symbolId: String) {
        viewModelScope.launch {
            _isChartLoading.value = true
            try {
                val data = ApiClient.fetchPriceHistory(symbolId)
                _chartData.value = data
            } catch (_: Exception) {
            } finally {
                _isChartLoading.value = false
            }
        }
    }

    fun selectSignal(signal: TradingSignal) {
        _selectedSignal.value = signal
        loadChart(signal.id)
    }

    fun dismissSignalModal() {
        _selectedSignal.value = null
    }

    fun toggleWatchlist(symbol: String) {
        _watchlist.update { current ->
            if (current.contains(symbol)) current - symbol else current + symbol
        }
    }

    fun setActiveTab(tab: String) {
        _activeTab.value = tab
    }

    fun setMinProbability(prob: Int) {
        _minProbability.value = prob
    }

    fun setSearchTerm(term: String) {
        _searchTerm.value = term
    }

    fun toggleTheme() {
        _isDarkTheme.update { !it }
    }

    fun toggleCurrency(useThb: Boolean) {
        _useThbCurrency.value = useThb
    }

    fun toggleSettings(isOpen: Boolean) {
        _isSettingsOpen.value = isOpen
    }

    fun toggleNotifications() {
        _notificationsEnabled.update { !it }
    }

    fun setPriceAlert(symbol: String, targetPrice: Double) {
        _priceAlerts.update { it + (symbol to targetPrice) }
    }

    override fun onCleared() {
        super.onCleared()
        binanceWs?.close(1000, "App closed")
    }
}
