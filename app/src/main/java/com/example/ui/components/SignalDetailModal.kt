package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
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
import com.example.model.TradingSignal
import com.example.ui.theme.*
import java.util.Locale
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignalDetailModal(
    signal: TradingSignal?,
    useThb: Boolean,
    onDismiss: () -> Unit
) {
    if (signal == null) return

    var activeTab by remember { mutableStateOf("tech") }
    val isLong = signal.type == "LONG"
    val displayPrice = if (useThb) signal.price * 36.45 else signal.price
    val displaySl = if (useThb) signal.sl * 36.45 else signal.sl
    val displayTp = if (useThb) signal.tp * 36.45 else signal.tp
    val currency = if (useThb) "฿" else "$"

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = CardDark,
        contentColor = TextWhite,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(vertical = 10.dp)
                    .width(40.dp)
                    .height(4.dp)
                    .background(BorderDark, RoundedCornerShape(2.dp))
            )
        },
        modifier = Modifier.testTag("signal_detail_sheet")
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .background(BgDark, CircleShape)
                            .border(1.dp, BorderDark, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = signal.symbol.take(3),
                            color = PrimaryPurpleMuted,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    }

                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "${signal.base}/${signal.quote}",
                                color = TextWhite,
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp
                            )
                            Box(
                                modifier = Modifier
                                    .background(if (isLong) GreenBg else RedBg, RoundedCornerShape(8.dp))
                                    .border(1.dp, if (isLong) GreenProfit else RedLoss, RoundedCornerShape(8.dp))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = signal.type,
                                    color = if (isLong) GreenText else RedText,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 11.sp
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .background(PrimaryPurple.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                                    .border(1.dp, PrimaryPurple.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "${signal.probability}% มั่นใจ",
                                    color = PrimaryPurpleMuted,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 11.sp
                                )
                            }
                        }
                        Text(
                            text = String.format(Locale.US, "%s%,.2f • %s%.2f%% • %s", currency, displayPrice, if (signal.change >= 0) "+" else "", signal.change, signal.timeframe),
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                }

                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .size(36.dp)
                        .background(BorderDark, CircleShape)
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = TextWhite, modifier = Modifier.size(18.dp))
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 3 Tabs
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BgDark, RoundedCornerShape(12.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                listOf(
                    Pair("tech", "เทคนิคพิเศษ"),
                    Pair("risk", "ข้อควรระวัง + SL/TP"),
                    Pair("ai", "AI Similarity")
                ).forEach { (tabId, label) ->
                    val isSelected = activeTab == tabId
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isSelected) TextWhite else BgDark)
                            .clickable { activeTab = tabId }
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

            Spacer(modifier = Modifier.height(16.dp))

            // Tab Content
            when (activeTab) {
                "tech" -> {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            InfoBox(
                                title = "สถานะสัญญาณ",
                                primaryText = signal.statusText,
                                subtitle = "${signal.reason} • ${signal.etfFlow} ETF",
                                modifier = Modifier.weight(1f)
                            )
                            InfoBox(
                                title = "RSI / MACD Momentum",
                                primaryText = if (signal.change >= 0) "โมเมนตัมขาขึ้น" else "โมเมนตัมชะลอ",
                                subtitle = "Binance klines 1D EMA",
                                modifier = Modifier.weight(1f),
                                highlightColor = if (signal.change >= 0) GreenText else RedText
                            )
                        }
                        InfoBox(
                            title = "24h Volume & สภาพคล่อง",
                            primaryText = "${signal.symbol} High Liquidity",
                            subtitle = "Orderbook Depth มีการรองรับคำสั่งซื้อขายหนาแน่น",
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }

                "risk" -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(BgDark, RoundedCornerShape(14.dp))
                            .border(1.dp, BorderDark, RoundedCornerShape(14.dp))
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "ข้อควรระวัง • SL/TP • Money Management",
                            color = TextWhite,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            // Stop loss box
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .background(RedBg, RoundedCornerShape(10.dp))
                                    .border(1.dp, RedLoss.copy(alpha = 0.4f), RoundedCornerShape(10.dp))
                                    .padding(12.dp)
                            ) {
                                Column {
                                    Text("Stop Loss (SL)", color = RedText, fontSize = 11.sp)
                                    Text(
                                        text = String.format(Locale.US, "%s%,.2f", currency, displaySl),
                                        color = TextWhite,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp
                                    )
                                    val slPercent = abs((1.0 - signal.sl / signal.price) * 100)
                                    Text(
                                        text = String.format(Locale.US, "-%.1f%% จากจุดเข้า", slPercent),
                                        color = TextDim,
                                        fontSize = 10.sp
                                    )
                                }
                            }

                            // Take profit box
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .background(GreenBg, RoundedCornerShape(10.dp))
                                    .border(1.dp, GreenProfit.copy(alpha = 0.4f), RoundedCornerShape(10.dp))
                                    .padding(12.dp)
                            ) {
                                Column {
                                    Text("Take Profit (TP)", color = GreenText, fontSize = 11.sp)
                                    Text(
                                        text = String.format(Locale.US, "%s%,.2f", currency, displayTp),
                                        color = TextWhite,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp
                                    )
                                    val tpPercent = abs((signal.tp / signal.price - 1.0) * 100)
                                    Text(
                                        text = String.format(Locale.US, "+%.1f%% เป้ากำไร", tpPercent),
                                        color = TextDim,
                                        fontSize = 10.sp
                                    )
                                }
                            }
                        }

                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("• อย่าเสี่ยงเกิน 2% ของพอร์ตต่อไม้", color = TextMuted, fontSize = 11.sp)
                            Text("• ข่าว FOMC / CPI อาจผันผวนแรง ระวัง gap ราคา", color = TextMuted, fontSize = 11.sp)
                            Text("• ถ้าหลุดต่ำกว่า SL ให้ตัดขาดทุนทันที อย่าเฉลี่ยเพิ่ม", color = TextMuted, fontSize = 11.sp)
                        }
                    }
                }

                "ai" -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(BgDark, RoundedCornerShape(14.dp))
                            .border(1.dp, BorderDark, RoundedCornerShape(14.dp))
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(48.dp)
                                    .background(PrimaryPurple.copy(alpha = 0.2f), CircleShape)
                                    .border(1.dp, PrimaryPurple, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "${signal.similarity}%",
                                    color = PrimaryPurpleMuted,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                            }

                            Column {
                                Text("AI Similarity Pattern ✓", color = TextWhite, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                Text(
                                    "คำนวณจาก Binance Orderbook Depth + Wave Pattern",
                                    color = TextDim,
                                    fontSize = 11.sp
                                )
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            signal.sources.forEach { src ->
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .background(CardDark, RoundedCornerShape(8.dp))
                                        .border(1.dp, BorderDark, RoundedCornerShape(8.dp))
                                        .padding(vertical = 6.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(src, color = TextMuted, fontSize = 11.sp)
                                }
                            }
                        }

                        Text(
                            text = "Tags: ${signal.tags.joinToString(" • ")} • วิเคราะห์จาก On-chain and Binance volume",
                            color = TextDim,
                            fontSize = 10.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoBox(
    title: String,
    primaryText: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    highlightColor: Color = TextWhite
) {
    Box(
        modifier = modifier
            .background(BgDark, RoundedCornerShape(12.dp))
            .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
            .padding(12.dp)
    ) {
        Column {
            Text(title, color = TextDim, fontSize = 10.sp)
            Spacer(modifier = Modifier.height(2.dp))
            Text(primaryText, color = highlightColor, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(2.dp))
            Text(subtitle, color = TextMuted, fontSize = 10.sp)
        }
    }
}
