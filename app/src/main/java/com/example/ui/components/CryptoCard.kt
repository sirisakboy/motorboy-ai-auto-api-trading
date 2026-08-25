package com.example.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.CryptoCoin
import com.example.model.FlashDirection
import com.example.model.TradingSignal
import com.example.ui.theme.*
import java.util.Locale

@Composable
fun CryptoCard(
    signal: TradingSignal,
    coin: CryptoCoin?,
    isWatchlisted: Boolean,
    useThb: Boolean,
    onToggleWatchlist: (String) -> Unit,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier
) {
    val flashColor by animateColorAsState(
        targetValue = when (coin?.flash) {
            FlashDirection.UP -> GreenProfit.copy(alpha = 0.25f)
            FlashDirection.DOWN -> RedLoss.copy(alpha = 0.25f)
            else -> CardDark
        },
        animationSpec = tween(durationMillis = 400),
        label = "flashAnimation"
    )

    val isLong = signal.type == "LONG"
    val displayPrice = if (useThb) signal.price * 36.45 else signal.price
    val currencyPrefix = if (useThb) "฿" else "$"

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(flashColor)
            .border(1.dp, BorderDark, RoundedCornerShape(18.dp))
            .clickable { onSelect() }
            .padding(16.dp)
            .testTag("signal_card_${signal.symbol.lowercase()}")
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Header Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Coin Symbol Circle
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(BgDark, CircleShape)
                            .border(1.dp, BorderDark, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = signal.symbol.take(3),
                            color = PrimaryPurpleMuted,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    }

                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                text = signal.symbol,
                                color = TextWhite,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                            Text(
                                text = "${signal.base}/${signal.quote}",
                                color = TextMuted,
                                fontSize = 11.sp
                            )
                        }
                        Text(
                            text = signal.sources.joinToString(" • "),
                            color = TextDim,
                            fontSize = 11.sp
                        )
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    // Watchlist button
                    IconButton(
                        onClick = { onToggleWatchlist(signal.symbol) },
                        modifier = Modifier.size(32.dp).testTag("watchlist_btn_${signal.symbol}")
                    ) {
                        Icon(
                            imageVector = if (isWatchlisted) Icons.Filled.Star else Icons.Outlined.StarOutline,
                            contentDescription = "Watchlist",
                            tint = if (isWatchlisted) PrimaryPurple else TextDim,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    // LONG / SHORT Badge
                    Box(
                        modifier = Modifier
                            .background(
                                color = if (isLong) GreenBg else RedBg,
                                shape = RoundedCornerShape(12.dp)
                            )
                            .border(
                                width = 1.dp,
                                color = if (isLong) GreenProfit.copy(alpha = 0.4f) else RedLoss.copy(alpha = 0.4f),
                                shape = RoundedCornerShape(12.dp)
                            )
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = signal.type,
                            color = if (isLong) GreenText else RedText,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Timeframe & Confidence
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${signal.timeframe} • ${signal.probability}% มั่นใจ",
                    color = PrimaryPurpleMuted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Price & Change
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = String.format(Locale.US, "%s%,.2f", currencyPrefix, displayPrice),
                    color = TextWhite,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
                val isPositive = signal.change >= 0
                Text(
                    text = String.format(Locale.US, "%s%.2f%%", if (isPositive) "+" else "", signal.change),
                    color = if (isPositive) GreenText else RedText,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Status & Reason Pill
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .background(BgDark, RoundedCornerShape(8.dp))
                        .border(1.dp, BorderDark, RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(signal.statusText, color = TextMuted, fontSize = 11.sp)
                }

                Box(
                    modifier = Modifier
                        .background(AccentPurple.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                        .border(1.dp, AccentPurple.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text("${signal.reason} • ${signal.etfFlow} ETF", color = PrimaryPurpleMuted, fontSize = 11.sp)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // SL & TP Quick view + Detailed breakdown trigger
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("SL: $currencyPrefix${String.format(Locale.US, "%,.1f", if (useThb) signal.sl * 36.45 else signal.sl)}", color = RedText, fontSize = 11.sp)
                    Text("TP: $currencyPrefix${String.format(Locale.US, "%,.1f", if (useThb) signal.tp * 36.45 else signal.tp)}", color = GreenText, fontSize = 11.sp)
                }

                Text(
                    text = "ดูโบ๊ะแตกเพิ่มเติม →",
                    color = PrimaryPurple,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    modifier = Modifier.clickable { onSelect() }
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Tags & AI similarity
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    signal.tags.forEach { tag ->
                        Box(
                            modifier = Modifier
                                .background(BorderDark, RoundedCornerShape(4.dp))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(tag, color = TextMuted, fontSize = 10.sp)
                        }
                    }
                }

                Text(
                    text = "AI ${signal.similarity}% ✓",
                    color = PrimaryPurpleMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}
