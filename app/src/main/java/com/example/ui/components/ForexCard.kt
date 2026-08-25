package com.example.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.FlashDirection
import com.example.model.ForexPair
import com.example.ui.theme.*
import java.util.Locale

@Composable
fun ForexCard(
    forex: ForexPair,
    apiStatus: String,
    modifier: Modifier = Modifier
) {
    val flashColor by animateColorAsState(
        targetValue = when (forex.flash) {
            FlashDirection.UP -> GreenProfit.copy(alpha = 0.25f)
            FlashDirection.DOWN -> RedLoss.copy(alpha = 0.25f)
            else -> CardDark
        },
        animationSpec = tween(durationMillis = 400),
        label = "forexFlash"
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(flashColor)
            .border(1.dp, BorderDark, RoundedCornerShape(18.dp))
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = forex.pair,
                        color = TextWhite,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    Text(
                        text = "Forex • $apiStatus • cache 30s + retry×3",
                        color = TextDim,
                        fontSize = 11.sp
                    )
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = String.format(Locale.US, "%,.4f", forex.price),
                        color = TextWhite,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    val isPositive = forex.change >= 0
                    Text(
                        text = String.format(Locale.US, "%s%.2f%%", if (isPositive) "+" else "", forex.change),
                        color = if (isPositive) GreenText else RedText,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 12.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    modifier = Modifier
                        .background(BgDark, RoundedCornerShape(12.dp))
                        .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text("open.er-api.com", color = TextMuted, fontSize = 10.sp)
                }

                Box(
                    modifier = Modifier
                        .background(BgDark, RoundedCornerShape(12.dp))
                        .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text("Frankfurter fallback", color = TextDim, fontSize = 10.sp)
                }
            }
        }
    }
}
