package com.noscam

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.noscam.service.DetectionService

class MainActivity : AppCompatActivity() {

    private lateinit var urlInput: EditText
    private lateinit var permissionStatus: TextView
    private lateinit var startBtn: Button
    private lateinit var stopBtn: Button

    private val prefs by lazy { getSharedPreferences("noscam", MODE_PRIVATE) }

    private val requestPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { updatePermissionStatus() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        urlInput = findViewById(R.id.backendUrl)
        permissionStatus = findViewById(R.id.permissionStatus)
        startBtn = findViewById(R.id.startBtn)
        stopBtn = findViewById(R.id.stopBtn)

        urlInput.setText(prefs.getString("backend_url", ""))

        startBtn.setOnClickListener { startDetection() }
        stopBtn.setOnClickListener { stopDetection() }

        updatePermissionStatus()
    }

    override fun onResume() {
        super.onResume()
        updatePermissionStatus()
    }

    private fun startDetection() {
        val url = urlInput.text.toString().trimEnd('/')
        if (url.isBlank()) { urlInput.error = "Enter backend URL"; return }

        if (!allPermissionsGranted()) {
            requestMissingPermissions()
            return
        }
        if (!Settings.canDrawOverlays(this)) {
            openOverlayPermissionSettings()
            return
        }

        prefs.edit().putString("backend_url", url).apply()

        val intent = Intent(this, DetectionService::class.java)
            .putExtra(DetectionService.EXTRA_BASE_URL, url)
        startForegroundService(intent)

        startBtn.isEnabled = false
        stopBtn.isEnabled = true
    }

    private fun stopDetection() {
        stopService(Intent(this, DetectionService::class.java))
        startBtn.isEnabled = true
        stopBtn.isEnabled = false
    }

    private fun allPermissionsGranted(): Boolean {
        val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        return perms.all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }
    }

    private fun requestMissingPermissions() {
        val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        requestPermissions.launch(perms.toTypedArray())
    }

    private fun openOverlayPermissionSettings() {
        startActivity(
            Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
        )
    }

    private fun updatePermissionStatus() {
        val micOk = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val overlayOk = Settings.canDrawOverlays(this)
        val notifOk = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        else true

        permissionStatus.text = buildString {
            appendLine("Microphone: ${if (micOk) "OK" else "REQUIRED — tap Start"}")
            appendLine("Draw over apps: ${if (overlayOk) "OK" else "REQUIRED — tap Start"}")
            append("Notifications: ${if (notifOk) "OK" else "REQUIRED — tap Start"}")
        }
    }
}
