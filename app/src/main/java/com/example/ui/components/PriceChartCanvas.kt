package com.example.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.ChartData
import com.example.ui.theme.*

@Composable
fun PriceChartCanvas(
    chartData: ChartData?,
    isLoading: Boolean,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(200.dp)
            .background(CardSubDark, RoundedCornerShape(14.dp))
            .border(1.dp, BorderDark, RoundedCornerShape(14.dp))
            .padding(8.dp),
        contentAlignment = Alignment.Center
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                color = PrimaryPurple,
                modifier = Modifier.size(32.dp),
                strokeWidth = 2.dp
            )
        } else if (chartData != null && chartData.prices.isNotEmpty()) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val w = size.width
                val h = size.height
                val pad = 12f

                val allVals = chartData.prices + chartData.ema20 + chartData.ema50
                val minP = (allVals.minOrNull() ?: 1.0) * 0.98
                val maxP = (allVals.maxOrNull() ?: 1.0) * 1.02
                val range = if (maxP - minP > 0) maxP - minP else 1.0

                // Grid lines
                for (i in 0..4) {
                    val y = (h * i) / 4f
                    drawLine(
                        color = BorderDark,
                        start = Offset(0f, y),
                        end = Offset(w, y),
                        strokeWidth = 1f
                    )
                }

                fun drawCurve(data: List<Double>, color: Color, strokeW: Float) {
                    if (data.size < 2) return
                    val path = Path()
                    data.forEachIndexed { idx, v ->
                        val x = (idx.toFloat() / (data.size - 1)) * w
                        val y = h - ((v - minP) / range).toFloat() * (h - pad * 2) - pad
                        if (idx == 0) path.moveTo(x, y) else path.lineTo(x, y)
                    }
                    drawPath(
                        path = path,
                        color = color,
                        style = Stroke(width = strokeW, cap = StrokeCap.Round)
                    )
                }

                // EMA50
                drawCurve(chartData.ema50, AccentPurple, 2.5f)
                // EMA20
                drawCurve(chartData.ema20, PrimaryPurpleMuted, 2.5f)
                // Price Line
                drawCurve(chartData.prices, GreenProfit, 3.5f)
            }
        } else {
            Text(
                text = "เลือกบัตรเพื่อดูกราฟ 90 วัน",
                color = TextDim,
                fontSize = 13.sp
            )
        }
    }
}

@Composable
fun ChartLegend(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(10.dp, 3.dp).background(GreenProfit))
            Spacer(modifier = Modifier.width(4.dp))
            Text("Price", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(10.dp, 3.dp).background(PrimaryPurpleMuted))
            Spacer(modifier = Modifier.width(4.dp))
            Text("EMA20", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(10.dp, 3.dp).background(AccentPurple))
            Spacer(modifier = Modifier.width(4.dp))
            Text("EMA50", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            "Binance 1D Candles",
            color = TextDim,
            fontSize = 11.sp
        )
    }
}
