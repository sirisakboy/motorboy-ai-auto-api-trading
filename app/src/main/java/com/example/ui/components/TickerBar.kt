package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.CryptoCoin
import com.example.ui.theme.*
import java.util.Locale

@Composable
fun TickerBar(
    coins: List<CryptoCoin>,
    useThb: Boolean = false,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(38.dp)
            .background(CardDark.copy(alpha = 0.95f))
            .horizontalScroll(scrollState)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        coins.take(5).forEachIndexed { index, coin ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = coin.symbol,
                    color = TextWhite,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp
                )
                val displayPrice = if (useThb) coin.price * 36.45 else coin.price
                val prefix = if (useThb) "฿" else "$"
                Text(
                    text = String.format(Locale.US, "%s%,.2f", prefix, displayPrice),
                    color = TextWhite,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
                val isPositive = coin.change >= 0
                Text(
                    text = String.format(Locale.US, "%s%.2f%%", if (isPositive) "+" else "", coin.change),
                    color = if (isPositive) GreenText else RedText,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            if (index < 4) {
                Text("•", color = TextDim, fontSize = 12.sp)
            }
        }
    }
}
