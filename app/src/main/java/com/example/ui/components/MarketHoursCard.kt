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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.MarketHoursInfo
import com.example.model.MarketStatus
import com.example.ui.theme.*

@Composable
fun MarketHoursCard(
    marketHours: MarketHoursInfo,
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
                text = "สถานะตลาด • Market Hours Engine",
                color = TextWhite,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp
            )

            Spacer(modifier = Modifier.height(12.dp))

            // SET Thai
            MarketRow(
                title = "SET ไทย",
                subtitle = "จ-ศ 10:00-12:30, 14:30-16:30 ICT",
                isOpen = marketHours.setStatus == MarketStatus.OPEN
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Forex
            MarketRow(
                title = "Forex 24h",
                subtitle = "ปิด เสาร์เช้า-อาทิตย์เช้า",
                isOpen = marketHours.forexStatus == MarketStatus.OPEN
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Crypto
            MarketRow(
                title = "Crypto",
                subtitle = "24/7 ไม่มีวันหยุด",
                isOpen = true
            )

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = marketHours.countdown,
                    color = PrimaryPurpleMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = marketHours.timestamp,
                    color = TextDim,
                    fontSize = 10.sp
                )
            }
        }
    }
}

@Composable
private fun MarketRow(
    title: String,
    subtitle: String,
    isOpen: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BgDark)
            .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(title, color = TextWhite, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = TextDim, fontSize = 10.sp)
        }

        Box(
            modifier = Modifier
                .background(
                    if (isOpen) GreenBg else BorderDark,
                    shape = RoundedCornerShape(12.dp)
                )
                .border(
                    1.dp,
                    if (isOpen) GreenProfit.copy(alpha = 0.4f) else BorderDark,
                    shape = RoundedCornerShape(12.dp)
                )
                .padding(horizontal = 8.dp, vertical = 3.dp)
        ) {
            Text(
                text = if (isOpen) "● OPEN" else "○ CLOSED",
                color = if (isOpen) GreenText else TextMuted,
                fontWeight = FontWeight.Bold,
                fontSize = 10.sp
            )
        }
    }
}
