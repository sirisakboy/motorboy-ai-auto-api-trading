package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.ui.components.*
import com.example.ui.theme.*
import com.example.ui.viewmodel.TradingViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TradingAppScreen(
    viewModel: TradingViewModel
) {
    val cryptoList by viewModel.cryptoList.collectAsStateWithLifecycle()
    val forexList by viewModel.forexList.collectAsStateWithLifecycle()
    val stockList by viewModel.stockList.collectAsStateWithLifecycle()
    val filteredSignals by viewModel.filteredSignals.collectAsStateWithLifecycle()
    val newsList by viewModel.newsList.collectAsStateWithLifecycle()
    val marketHours by viewModel.marketHours.collectAsStateWithLifecycle()
    val apiStatus by viewModel.apiStatus.collectAsStateWithLifecycle()
    val activeTab by viewModel.activeTab.collectAsStateWithLifecycle()
    val minProb by viewModel.minProbability.collectAsStateWithLifecycle()
    val searchTerm by viewModel.searchTerm.collectAsStateWithLifecycle()
    val watchlist by viewModel.watchlist.collectAsStateWithLifecycle()
    val selectedSignal by viewModel.selectedSignal.collectAsStateWithLifecycle()
    val chartData by viewModel.chartData.collectAsStateWithLifecycle()
    val isChartLoading by viewModel.isChartLoading.collectAsStateWithLifecycle()
    val useThb by viewModel.useThbCurrency.collectAsStateWithLifecycle()
    val isDark by viewModel.isDarkTheme.collectAsStateWithLifecycle()
    val isSettingsOpen by viewModel.isSettingsOpen.collectAsStateWithLifecycle()
    val notifEnabled by viewModel.notificationsEnabled.collectAsStateWithLifecycle()
    val priceAlerts by viewModel.priceAlerts.collectAsStateWithLifecycle()

    BoxWithConstraints(modifier = Modifier.fillMaxSize().background(if (isDark) BgDark else BgLight)) {
        val isWide = maxWidth >= 840.dp

        Scaffold(
            topBar = {
                // Main Header Bar
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (isDark) BgDark else CardLight)
                        .border(1.dp, if (isDark) BorderDark else BorderLight)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(64.dp)
                            .padding(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Logo & Brand
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .background(CardDark, RoundedCornerShape(10.dp))
                                    .border(1.dp, BorderDark, RoundedCornerShape(10.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text("⚡", fontSize = 18.sp)
                            }

                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(
                                        text = "TRADING",
                                        color = if (isDark) TextWhite else Color(0xFF0F172A),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        letterSpacing = (-0.5).sp
                                    )
                                    Text(
                                        text = "ENGINE",
                                        color = PrimaryPurple,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp
                                    )
                                    Box(
                                        modifier = Modifier
                                            .background(PrimaryPurple.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                                            .border(1.dp, PrimaryPurple.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text("PRO", color = PrimaryPurpleMuted, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                                Text(
                                    text = "Real-time Multi-Asset • Live",
                                    color = TextDim,
                                    fontSize = 10.sp
                                )
                            }
                        }

                        // Header action buttons
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // Currency Switch (USD / THB)
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(if (isDark) CardDark else CardLight)
                                    .border(1.dp, if (isDark) BorderDark else BorderLight, RoundedCornerShape(16.dp))
                                    .clickable { viewModel.toggleCurrency(!useThb) }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    text = if (useThb) "฿ THB" else "$ USD",
                                    color = PrimaryPurple,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            // Theme Toggle
                            IconButton(
                                onClick = { viewModel.toggleTheme() },
                                modifier = Modifier
                                    .size(36.dp)
                                    .background(if (isDark) CardDark else CardLight, CircleShape)
                                    .border(1.dp, if (isDark) BorderDark else BorderLight, CircleShape)
                            ) {
                                Icon(
                                    imageVector = if (isDark) Icons.Default.DarkMode else Icons.Default.LightMode,
                                    contentDescription = "Toggle Theme",
                                    tint = if (isDark) TextWhite else Color(0xFF0F172A),
                                    modifier = Modifier.size(18.dp)
                                )
                            }

                            // Notifications
                            Box(contentAlignment = Alignment.TopEnd) {
                                IconButton(
                                    onClick = { viewModel.toggleNotifications() },
                                    modifier = Modifier
                                        .size(36.dp)
                                        .background(if (isDark) CardDark else CardLight, CircleShape)
                                        .border(1.dp, if (isDark) BorderDark else BorderLight, CircleShape)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Notifications,
                                        contentDescription = "Notifications",
                                        tint = if (notifEnabled) PrimaryPurple else TextDim,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                if (priceAlerts.isNotEmpty()) {
                                    Box(
                                        modifier = Modifier
                                            .offset(x = 2.dp, y = (-2).dp)
                                            .size(16.dp)
                                            .background(RedLoss, CircleShape),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text("${priceAlerts.size}", color = TextWhite, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }

                            // Settings
                            IconButton(
                                onClick = { viewModel.toggleSettings(true) },
                                modifier = Modifier
                                    .size(36.dp)
                                    .background(if (isDark) CardDark else CardLight, CircleShape)
                                    .border(1.dp, if (isDark) BorderDark else BorderLight, CircleShape)
                                    .testTag("settings_btn")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Settings,
                                    contentDescription = "Settings",
                                    tint = if (isDark) TextWhite else Color(0xFF0F172A),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }

                    // Ticker Bar
                    TickerBar(coins = cryptoList, useThb = useThb)
                }
            },
            containerColor = if (isDark) BgDark else BgLight
        ) { paddingValues ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(horizontal = if (isWide) 24.dp else 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                contentPadding = PaddingValues(top = 16.dp, bottom = 32.dp)
            ) {
                // Tab Selection Row
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(CardDark, RoundedCornerShape(24.dp))
                            .border(1.dp, BorderDark, RoundedCornerShape(24.dp))
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        listOf(
                            Pair("crypto", "คริปโต"),
                            Pair("forex", "คู่เงิน"),
                            Pair("stocks", "หุ้น"),
                            Pair("watchlist", "Watchlist (${watchlist.size})")
                        ).forEach { (tabId, label) ->
                            val isSelected = activeTab == tabId
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(20.dp))
                                    .background(if (isSelected) TextWhite else CardDark)
                                    .clickable { viewModel.setActiveTab(tabId) }
                                    .padding(vertical = 8.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = label,
                                    color = if (isSelected) Color.Black else TextMuted,
                                    fontSize = 12.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                                )
                            }
                        }
                    }
                }

                // Filter & Search Bar
                item {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        // Slider & Search row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Volatility Confidence Filter
                            Box(
                                modifier = Modifier
                                    .weight(1.2f)
                                    .background(CardDark, RoundedCornerShape(20.dp))
                                    .border(1.dp, BorderDark, RoundedCornerShape(20.dp))
                                    .padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Column {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text("กรองความผันผวน", color = TextDim, fontSize = 10.sp)
                                        Text("≥ $minProb%", color = PrimaryPurpleMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }
                                    Slider(
                                        value = minProb.toFloat(),
                                        onValueChange = { viewModel.setMinProbability(it.toInt()) },
                                        valueRange = 50f..95f,
                                        colors = SliderDefaults.colors(
                                            thumbColor = PrimaryPurple,
                                            activeTrackColor = PrimaryPurple,
                                            inactiveTrackColor = BorderDark
                                        ),
                                        modifier = Modifier.height(24.dp)
                                    )
                                }
                            }

                            // Search Input
                            OutlinedTextField(
                                value = searchTerm,
                                onValueChange = { viewModel.setSearchTerm(it) },
                                placeholder = { Text("ค้นหา BTC, ETH...", color = TextDim, fontSize = 12.sp) },
                                leadingIcon = {
                                    Icon(Icons.Default.Search, contentDescription = "Search", tint = TextDim, modifier = Modifier.size(16.dp))
                                },
                                shape = RoundedCornerShape(20.dp),
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = PrimaryPurple,
                                    unfocusedBorderColor = BorderDark,
                                    focusedContainerColor = CardDark,
                                    unfocusedContainerColor = CardDark,
                                    focusedTextColor = TextWhite,
                                    unfocusedTextColor = TextWhite
                                ),
                                modifier = Modifier.weight(1f).height(52.dp)
                            )
                        }

                        // Status Info Row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .background(CardDark, RoundedCornerShape(12.dp))
                                    .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
                                    .padding(horizontal = 10.dp, vertical = 4.dp)
                            ) {
                                Text(
                                    text = "กรองความผันผวน ≥ $minProb% | ${filteredSignals.size} คู่",
                                    color = TextMuted,
                                    fontSize = 11.sp
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .background(CardDark, RoundedCornerShape(12.dp))
                                    .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
                                    .padding(horizontal = 10.dp, vertical = 4.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(6.dp)
                                            .background(if (apiStatus.binanceWs == "LIVE") GreenProfit else RedLoss, CircleShape)
                                    )
                                    Text(
                                        text = "Latency -95% WS ${apiStatus.binanceWs}",
                                        color = TextMuted,
                                        fontSize = 11.sp
                                    )
                                }
                            }
                        }
                    }
                }

                // Section 1: Main Feed by Active Tab
                when (activeTab) {
                    "crypto" -> {
                        if (filteredSignals.isEmpty()) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(CardDark, RoundedCornerShape(18.dp))
                                        .border(1.dp, BorderDark, RoundedCornerShape(18.dp))
                                        .padding(32.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text("ไม่มีสัญญาณที่ตรงกับเกณฑ์กรอง (ลองลด % ความผันผวน)", color = TextDim, fontSize = 13.sp)
                                }
                            }
                        } else {
                            items(filteredSignals, key = { it.id }) { signal ->
                                val coin = cryptoList.find { it.id == signal.id }
                                CryptoCard(
                                    signal = signal,
                                    coin = coin,
                                    isWatchlisted = watchlist.contains(signal.symbol),
                                    useThb = useThb,
                                    onToggleWatchlist = { viewModel.toggleWatchlist(it) },
                                    onSelect = { viewModel.selectSignal(signal) }
                                )
                            }
                        }
                    }

                    "forex" -> {
                        items(forexList, key = { it.pair }) { pair ->
                            ForexCard(forex = pair, apiStatus = apiStatus.forex)
                        }
                    }

                    "stocks" -> {
                        items(stockList, key = { it.symbol }) { stock ->
                            StockCard(
                                stock = stock,
                                marketStatusText = if (stock.symbol == "SET") marketHours.setStatus.name else "OPEN",
                                countdown = marketHours.countdown
                            )
                        }
                    }

                    "watchlist" -> {
                        if (filteredSignals.isEmpty()) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(CardDark, RoundedCornerShape(18.dp))
                                        .border(1.dp, BorderDark, RoundedCornerShape(18.dp))
                                        .padding(32.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("⭐", fontSize = 28.sp)
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Text("ยังไม่มีรายการใน Watchlist", color = TextWhite, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                        Text("กดไอคอน ★ ในการ์ดคริปโตเพื่อเพิ่มรายการโปรด", color = TextDim, fontSize = 11.sp)
                                    }
                                }
                            }
                        } else {
                            items(filteredSignals, key = { it.id }) { signal ->
                                val coin = cryptoList.find { it.id == signal.id }
                                CryptoCard(
                                    signal = signal,
                                    coin = coin,
                                    isWatchlisted = true,
                                    useThb = useThb,
                                    onToggleWatchlist = { viewModel.toggleWatchlist(it) },
                                    onSelect = { viewModel.selectSignal(signal) }
                                )
                            }
                        }
                    }
                }

                // Section 2: Real-time 90-Day Price Chart
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(CardDark, RoundedCornerShape(18.dp))
                            .border(1.dp, BorderDark, RoundedCornerShape(18.dp))
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "กราฟ 90 วัน • EMA Indicator",
                                color = TextWhite,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                            Box(
                                modifier = Modifier
                                    .background(BgDark, RoundedCornerShape(12.dp))
                                    .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text("Binance klines 1D", color = TextDim, fontSize = 10.sp)
                            }
                        }

                        PriceChartCanvas(chartData = chartData, isLoading = isChartLoading)
                        ChartLegend()
                    }
                }

                // Section 3: Market Hours & Schedule Engine
                item {
                    MarketHoursCard(marketHours = marketHours)
                }

                // Section 4: Real-time News (RSS 4 sources)
                item {
                    NewsCard(articles = newsList)
                }

                // Section 5: API Status & Error Handling
                item {
                    ApiStatusCard(status = apiStatus)
                }

                // Section 6: Roadmap Phase 2 Live
                item {
                    RoadmapCard()
                }

                // Footer
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = "© 2025 Trading Engine Pro • Cozy Evening #0F1117 • Kotlin Compose",
                            color = TextDim,
                            fontSize = 11.sp
                        )
                        Text(
                            text = "Binance WebSocket • CoinGecko REST • open.er-api • Frankfurter",
                            color = TextDim.copy(alpha = 0.6f),
                            fontSize = 10.sp
                        )
                    }
                }
            }
        }

        // Signal Detail Modal
        SignalDetailModal(
            signal = selectedSignal,
            useThb = useThb,
            onDismiss = { viewModel.dismissSignalModal() }
        )

        // Settings Dialog
        if (isSettingsOpen) {
            SettingsDialog(
                useThb = useThb,
                onToggleCurrency = { viewModel.toggleCurrency(it) },
                notificationsEnabled = notifEnabled,
                onToggleNotifications = { viewModel.toggleNotifications() },
                onSetAlert = { s, p -> viewModel.setPriceAlert(s, p) },
                onDismiss = { viewModel.toggleSettings(false) }
            )
        }
    }
}
