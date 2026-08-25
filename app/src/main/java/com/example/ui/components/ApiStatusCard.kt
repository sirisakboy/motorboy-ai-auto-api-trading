package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.ApiStatusState
import com.example.ui.theme.*

@Composable
fun ApiStatusCard(
    status: ApiStatusState,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(CardDark)
            .border(1.dp, BorderDark, RoundedCornerShape(18.dp))
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "API สถานะ • Error Handling",
                color = TextWhite,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp
            )

            Spacer(modifier = Modifier.height(12.dp))

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                StatusRow("Binance WebSocket", status.binanceWs)
                StatusRow("CoinGecko REST", status.coinGecko)
                StatusRow("Forex (er-api)", status.forex)
                StatusRow("News (RSS2JSON ×4)", status.news)
                StatusRow("Trading Signals", status.signals)
            }

            Spacer(modifier = Modifier.height(10.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BgDark, RoundedCornerShape(8.dp))
                    .padding(8.dp)
            ) {
                Text(
                    text = "fetchWithFallback(primary, fallback)\nPromise.allSettled(RSS 4)\nOkHttp WebSocket auto-reconnect",
                    color = TextDim,
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    lineHeight = 14.sp
                )
            }
        }
    }
}

@Composable
private fun StatusRow(label: String, state: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, color = TextMuted, fontSize = 11.sp)
        Text(
            text = state,
            color = if (state == "LIVE") GreenText else if (state == "CONNECTING") PrimaryPurpleMuted else RedText,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
fun RoadmapCard(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(CardDark)
            .border(1.dp, PrimaryPurple.copy(alpha = 0.3f), RoundedCornerShape(18.dp))
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Roadmap Phase 2 Live ✓",
                    color = TextWhite,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
                Box(
                    modifier = Modifier
                        .background(GreenBg, RoundedCornerShape(12.dp))
                        .border(1.dp, GreenProfit.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text("FINAL", color = GreenText, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            val items = listOf(
                "2.1 Real Binance WebSocket multi-symbol ✓",
                "2.2 CoinGecko REST + Binance REST fallback ✓",
                "2.3 Forex er-api.com + Frankfurter fallback ✓",
                "2.4 RSS news 4 sources + allorigins fallback ✓",
                "2.5 Real orderbook similarity (Binance depth) ✓",
                "2.6 Real price chart (Binance klines + EMA20/50) ✓",
                "2.7 Real market hours (SET/Forex/Crypto) ✓",
                "2.8 Trading signals with SL/TP from real data ✓"
            )

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items.forEach { item ->
                    Text(
                        text = "• $item",
                        color = TextMuted,
                        fontSize = 11.sp,
                        lineHeight = 15.sp
                    )
                }
            }
        }
    }
}
