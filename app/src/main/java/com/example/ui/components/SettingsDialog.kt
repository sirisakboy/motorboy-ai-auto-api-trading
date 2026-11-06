package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.ui.theme.*

@Composable
fun SettingsDialog(
    useThb: Boolean,
    onToggleCurrency: (Boolean) -> Unit,
    notificationsEnabled: Boolean,
    onToggleNotifications: () -> Unit,
    onSetAlert: (String, Double) -> Unit,
    onDismiss: () -> Unit
) {
    var symbolInput by remember { mutableStateOf("BTC") }
    var priceInput by remember { mutableStateOf("") }
    var alertSavedText by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(CardDark)
                .border(1.dp, BorderDark, RoundedCornerShape(20.dp))
                .padding(20.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(
                    text = "⚙️ การตั้งค่า Trading Engine Pro",
                    color = TextWhite,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )

                // Currency Switch
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("สกุลเงินแสดงผล", color = TextWhite, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        Text(if (useThb) "บาทไทย (฿ THB)" else "ดอลลาร์สหรัฐ ($ USD)", color = TextDim, fontSize = 11.sp)
                    }
                    Switch(
                        checked = useThb,
                        onCheckedChange = onToggleCurrency,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = PrimaryPurple,
                            uncheckedThumbColor = TextDim,
                            uncheckedTrackColor = BgDark
                        )
                    )
                }

                Divider(color = BorderDark, thickness = 1.dp)

                // Notifications
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("การแจ้งเตือนสัญญาณ", color = TextWhite, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        Text(if (notificationsEnabled) "เปิดใช้งานแล้ว" else "ปิดอยู่", color = TextDim, fontSize = 11.sp)
                    }
                    Button(
                        onClick = onToggleNotifications,
                        colors = ButtonDefaults.buttonColors(containerColor = if (notificationsEnabled) GreenProfit.copy(alpha = 0.3f) else PrimaryPurple)
                    ) {
                        Text(if (notificationsEnabled) "เปิดอยู่ ✓" else "เปิดแจ้งเตือน", fontSize = 11.sp)
                    }
                }

                Divider(color = BorderDark, thickness = 1.dp)

                // Price Alert Setup
                Text("🔔 ตั้งเป้าเตือนราคา (Price Alert)", color = TextWhite, fontSize = 13.sp, fontWeight = FontWeight.Bold)

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = symbolInput,
                        onValueChange = { symbolInput = it.uppercase() },
                        label = { Text("เหรียญ", fontSize = 10.sp, color = TextDim) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryPurple,
                            unfocusedBorderColor = BorderDark,
                            focusedTextColor = TextWhite,
                            unfocusedTextColor = TextWhite
                        ),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = priceInput,
                        onValueChange = { priceInput = it },
                        label = { Text("ราคาเป้าหมาย", fontSize = 10.sp, color = TextDim) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryPurple,
                            unfocusedBorderColor = BorderDark,
                            focusedTextColor = TextWhite,
                            unfocusedTextColor = TextWhite
                        ),
                        modifier = Modifier.weight(1.5f),
                        singleLine = true
                    )
                }

                Button(
                    onClick = {
                        val p = priceInput.toDoubleOrNull()
                        if (p != null && symbolInput.isNotBlank()) {
                            onSetAlert(symbolInput, p)
                            alertSavedText = "บันทึกการเตือน $symbolInput ที่ $p สำเร็จ!"
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryPurple)
                ) {
                    Text("บันทึกการแจ้งเตือนราคา", fontWeight = FontWeight.Bold)
                }

                if (alertSavedText.isNotEmpty()) {
                    Text(alertSavedText, color = GreenText, fontSize = 11.sp)
                }

                // Close button
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.align(Alignment.End)
                ) {
                    Text("ปิดหน้าต่าง", color = TextMuted)
                }
            }
        }
    }
}
