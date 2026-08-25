package com.example.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.MarketStatus
import com.example.model.StockIndex
import com.example.ui.theme.*
import java.util.Locale

@Composable
fun StockCard(
    stock: StockIndex,
    marketStatusText: String,
    countdown: String,
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(BgDark, CircleShape)
                            .border(1.dp, BorderDark, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stock.symbol.take(1),
                            color = PrimaryPurpleMuted,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    }

                    Column {
                        Text(
                            text = "${stock.symbol} • ${stock.name}",
                            color = TextWhite,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                        Text(
                            text = "${stock.schedule} • $marketStatusText • $countdown",
                            color = TextDim,
                            fontSize = 11.sp
                        )
                    }
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = String.format(Locale.US, "%,.2f", stock.price),
                        color = TextWhite,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    val isPositive = stock.change >= 0
                    Text(
                        text = String.format(Locale.US, "%s%.2f%%", if (isPositive) "+" else "", stock.change),
                        color = if (isPositive) GreenText else RedText,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 12.sp
                    )
                }
            }

            if (stock.symbol == "SET") {
                Spacer(modifier = Modifier.height(12.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                        .background(BgDark, RoundedCornerShape(12.dp))
                        .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Canvas(modifier = Modifier.width(140.dp).height(36.dp)) {
                            val w = size.width
                            val h = size.height
                            val path = Path().apply {
                                moveTo(5f, h * 0.7f)
                                quadraticTo(w * 0.3f, h * 0.1f, w * 0.5f, h * 0.4f)
                                quadraticTo(w * 0.75f, h * 0.6f, w - 5f, h * 0.25f)
                            }
                            drawPath(
                                path = path,
                                color = AccentPurple,
                                style = Stroke(width = 2.5f, cap = StrokeCap.Round)
                            )
                            drawCircle(
                                color = PrimaryPurple,
                                radius = 4.5f,
                                center = Offset(w * 0.5f, h * 0.4f)
                            )
                        }

                        Text(
                            text = if (stock.status == MarketStatus.OPEN) "กราฟแสดงข้อมูลเรียลไทม์" else "ตลาดปิด • แสดงกราฟจำลองช่วงปิด",
                            color = TextDim,
                            fontSize = 11.sp
                        )
                    }
                }
            }
        }
    }
}
