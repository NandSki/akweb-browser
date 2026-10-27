package com.akweb.browser

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Log debug sederhana untuk panel di MainActivity.
 * Murni Kotlin (tanpa dependensi Android/Gecko) supaya mudah dibaca.
 * Bukan log sistem: isinya hanya status aplikasi ini sendiri.
 */
object DebugLog {
    private const val MAX_LINES = 200
    private val lines = ArrayList<String>()
    var listener: ((String) -> Unit)? = null

    @Synchronized
    fun append(message: String) {
        val time = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        lines.add("[$time] $message")
        while (lines.size > MAX_LINES) {
            lines.removeAt(0)
        }
        listener?.invoke(text())
    }

    @Synchronized
    fun text(): String {
        return lines.joinToString("\n")
    }

    @Synchronized
    fun clear() {
        lines.clear()
        listener?.invoke("")
    }
}
