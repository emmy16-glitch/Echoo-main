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
 * Keeps Echoo audio alive when the app is minimized.
 *
 * This minimal service holds foreground importance (mediaPlayback type) with a
 * lock-screen notification while recorded audio or a live room is playing.
 */
class EchooLiveAudioService : Service() {
  companion object {
    private const val CHANNEL_ID = "echoo_audio_playback"
    private const val NOTIFICATION_ID = 0xE000
    private const val EXTRA_TITLE = "extra_title"
    private const val EXTRA_ARTIST = "extra_artist"
    private const val EXTRA_BROADCAST_ID = "extra_broadcast_id"
    private const val EXTRA_KIND = "extra_kind"
    private const val ACTION_STOP = "org.digi02.echoo.liveaudioservice.STOP"

    fun start(context: Context, title: String, artist: String, broadcastId: String, kind: String) {
      val intent = Intent(context, EchooLiveAudioService::class.java).apply {
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_ARTIST, artist)
        putExtra(EXTRA_BROADCAST_ID, broadcastId)
        putExtra(EXTRA_KIND, kind)
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

    val kind = intent?.getStringExtra(EXTRA_KIND).orEmpty().ifEmpty { "live" }
    val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty().ifEmpty {
      if (kind == "audio") "Playing on Echoo" else "Live on Echoo"
    }
    val artist = intent?.getStringExtra(EXTRA_ARTIST).orEmpty()
    val broadcastId = intent?.getStringExtra(EXTRA_BROADCAST_ID).orEmpty()

    startForegroundWithNotification(title, artist, broadcastId, kind)
    return START_NOT_STICKY
  }

  private fun startForegroundWithNotification(
    title: String,
    artist: String,
    broadcastId: String,
    kind: String
  ) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Echoo playback", NotificationManager.IMPORTANCE_LOW)
      )
    }

    val deepLink = if (kind == "live" && broadcastId.isNotEmpty()) {
      "echoo://listen/live/$broadcastId"
    } else {
      "echoo://audio-player"
    }
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

    val contentText = if (artist.isNotEmpty()) {
      if (kind == "live") "$artist - LIVE" else artist
    } else {
      if (kind == "live") "LIVE on Echoo" else "Playing on Echoo"
    }

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(contentText)
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
