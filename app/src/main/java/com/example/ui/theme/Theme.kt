package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = PrimaryPurple,
    secondary = AccentPurple,
    tertiary = PrimaryPurpleMuted,
    background = BgDark,
    surface = CardDark,
    surfaceVariant = BorderDark,
    onPrimary = Color.Black,
    onSecondary = Color.White,
    onBackground = TextWhite,
    onSurface = TextWhite,
    outline = BorderDark
)

private val LightColorScheme = lightColorScheme(
    primary = PrimaryPurple,
    secondary = AccentPurple,
    tertiary = PrimaryPurpleMuted,
    background = BgLight,
    surface = CardLight,
    surfaceVariant = BorderLight,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = Color(0xFF1E293B),
    onSurface = Color(0xFF1E293B),
    outline = BorderLight
)

@Composable
fun TradingEngineTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
