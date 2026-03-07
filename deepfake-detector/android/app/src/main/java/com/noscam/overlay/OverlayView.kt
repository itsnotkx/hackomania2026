package com.noscam.overlay

import android.content.Context
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.noscam.R
import com.noscam.model.DetectionResult
import com.noscam.model.OverlayState

class OverlayView(
    private val context: Context,
    private val onToggle: (paused: Boolean) -> Unit
) {
    private val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val root: View = LayoutInflater.from(context).inflate(R.layout.overlay_badge, null)

    private val statusDot = root.findViewById<View>(R.id.statusDot)
    private val statusLabel = root.findViewById<TextView>(R.id.statusLabel)
    private val scoreLabel = root.findViewById<TextView>(R.id.scoreLabel)
    private val toggleBtn = root.findViewById<TextView>(R.id.toggleBtn)

    private val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        PixelFormat.TRANSLUCENT
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        x = 40
        y = 120
    }

    private var expanded = false
    private var paused = false
    private var lastResult: DetectionResult? = null

    init {
        setupDrag()
        setupClickListeners()
    }

    fun show() = wm.addView(root, params)
    fun hide() = runCatching { wm.removeView(root) }

    fun updateState(state: OverlayState, result: DetectionResult? = null) {
        lastResult = result
        root.post {
            when (state) {
                OverlayState.DETECTING -> {
                    statusDot.setBackgroundResource(R.drawable.dot_blue)
                    statusLabel.text = "DETECTING..."
                }
                OverlayState.REAL -> {
                    statusDot.setBackgroundResource(R.drawable.dot_green)
                    statusLabel.text = "REAL"
                }
                OverlayState.UNCERTAIN -> {
                    statusDot.setBackgroundResource(R.drawable.dot_yellow)
                    statusLabel.text = "UNCERTAIN"
                }
                OverlayState.FAKE -> {
                    statusDot.setBackgroundResource(R.drawable.dot_red)
                    statusLabel.text = "FAKE"
                }
                OverlayState.PAUSED -> {
                    statusDot.setBackgroundResource(R.drawable.dot_grey)
                    statusLabel.text = "PAUSED"
                    scoreLabel.visibility = View.GONE
                    expanded = false
                }
            }
            if (expanded && result != null) {
                scoreLabel.text = "Score: ${"%.2f".format(result.score)} · Avg: ${"%.2f".format(result.rollingAvg)}"
            }
        }
    }

    private fun setupClickListeners() {
        root.setOnClickListener {
            expanded = !expanded
            scoreLabel.visibility = if (expanded && lastResult != null) View.VISIBLE else View.GONE
            if (expanded && lastResult != null) {
                scoreLabel.text = "Score: ${"%.2f".format(lastResult!!.score)} · Avg: ${"%.2f".format(lastResult!!.rollingAvg)}"
            }
        }

        toggleBtn.setOnClickListener { v ->
            v.parent.requestDisallowInterceptTouchEvent(true)
            paused = !paused
            toggleBtn.text = if (paused) ">" else "II"
            onToggle(paused)
            if (paused) updateState(OverlayState.PAUSED)
        }
    }

    private fun setupDrag() {
        var startX = 0f; var startY = 0f
        var initX = 0; var initY = 0
        var dragging = false

        root.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = event.rawX; startY = event.rawY
                    initX = params.x; initY = params.y
                    dragging = false
                    false
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - startX
                    val dy = event.rawY - startY
                    if (kotlin.math.abs(dx) > 5 || kotlin.math.abs(dy) > 5) {
                        dragging = true
                        params.x = (initX + dx).toInt()
                        params.y = (initY + dy).toInt()
                        wm.updateViewLayout(root, params)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> dragging
                else -> false
            }
        }
    }
}
