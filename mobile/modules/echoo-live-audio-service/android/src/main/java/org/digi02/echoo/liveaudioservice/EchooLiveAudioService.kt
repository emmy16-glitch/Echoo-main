package org.digi02.echoo.liveaudioservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Keeps Echoo live (LiveKit) audio alive when the app is minimized.
 *
 * LiveKit renders audio outside expo-audio, so expo-audio's own media
 * foreground service does not cover live sessions. This minimal service holds
 * foreground importance (mediaPlayback type) with a lock-screen notification
 * while a live room is connected. Swiping the app away stops it via
 * onTaskRemoved — dismissing the app means stop listening.
 */
class EchooLiveAudioService : Service() {
  companion object {
    private const val CHANNEL_ID = "echoo_live_audio"
    private const val NOTIFICATION_ID = 0xE000
    private const val EXTRA_TITLE = "extra_title"
    private const val EXTRA_ARTIST = "extra_artist"
    private const val EXTRA_BROADCAST_ID = "extra_broadcast_id"
    private const val ACTION_STOP = "org.digi02.echoo.liveaudioservice.STOP"

    fun start(context: Context, title: String, artist: String, broadcastId: String) {
      val intent = Intent(context, EchooLiveAudioService::class.java).apply {
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_ARTIST, artist)
        putExtra(EXTRA_BROADCAST_ID, broadcastId)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, EchooLiveAudioService::class.java))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty().ifEmpty { "Live on Echoo" }
    val artist = intent?.getStringExtra(EXTRA_ARTIST).orEmpty()
    val broadcastId = intent?.getStringExtra(EXTRA_BROADCAST_ID).orEmpty()
    startForegroundWithNotification(title, artist, broadcastId)
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
  }

  private fun startForegroundWithNotification(title: String, artist: String, broadcastId: String) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Live audio", NotificationManager.IMPORTANCE_LOW)
      )
    }

    // Tap returns to the live room through the app deep-link scheme.
    val deepLink = if (broadcastId.isNotEmpty()) "echoo://listen/live/$broadcastId" else "echoo://"
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      data = Uri.parse(deepLink)
    }
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this, 0, it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val stopIntent = PendingIntent.getService(
      this, 1,
      Intent(this, EchooLiveAudioService::class.java).apply { action = ACTION_STOP },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(if (artist.isNotEmpty()) "$artist • LIVE" else "LIVE on Echoo")
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setOngoing(true)
      .addAction(android.R.drawable.ic_media_pause, "Stop", stopIntent)
    if (contentIntent != null) builder.setContentIntent(contentIntent)
    val notification: Notification = builder.build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      )
    } else {
      @Suppress("DEPRECATION")
      startForeground(NOTIFICATION_ID, notification)
    }
  }
}
