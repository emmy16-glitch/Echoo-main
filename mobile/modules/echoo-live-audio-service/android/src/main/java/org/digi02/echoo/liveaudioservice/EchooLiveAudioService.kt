package org.digi02.echoo.liveaudioservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.IBinder

/**
 * Keeps Echoo audio alive when the app is minimized.
 *
 * The LiveKit room owns the actual audio. This service gives that listener
 * session Android's mediaPlayback foreground priority and a real MediaSession
 * while the app is in the background.
 */
class EchooLiveAudioService : Service() {
  companion object {
    private const val CHANNEL_ID = "echoo_audio_playback"
    private const val NOTIFICATION_ID = 0xE000
    private const val EXTRA_TITLE = "extra_title"
    private const val EXTRA_ARTIST = "extra_artist"
    private const val EXTRA_BROADCAST_ID = "extra_broadcast_id"
    private const val EXTRA_KIND = "extra_kind"
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

  private var mediaSession: MediaSession? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val kind = intent?.getStringExtra(EXTRA_KIND).orEmpty().ifEmpty { "live" }
    val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty().ifEmpty {
      if (kind == "audio") "Playing on Echoo" else "Live on Echoo"
    }
    val artist = intent?.getStringExtra(EXTRA_ARTIST).orEmpty()
    val broadcastId = intent?.getStringExtra(EXTRA_BROADCAST_ID).orEmpty()

    startForegroundWithNotification(title, artist, broadcastId, kind)
    // A media listener may stay active for hours. Re-deliver the latest
    // metadata if Android must recreate this foreground service.
    return START_REDELIVER_INTENT
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Be explicit: listener playback must not be tied to the activity task.
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    super.onDestroy()
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
      if (kind != "broadcast") data = Uri.parse(deepLink)
    }
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this, 0, it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val contentText = if (artist.isNotEmpty()) {
      if (kind == "broadcast") "$artist - BROADCASTING" else if (kind == "live") "$artist - LIVE" else artist
    } else {
      if (kind == "broadcast") "Broadcasting from Echoo" else if (kind == "live") "LIVE on Echoo" else "Playing on Echoo"
    }

    val session = ensureMediaSession()
    session.setMetadata(
      MediaMetadata.Builder()
        .putString(MediaMetadata.METADATA_KEY_TITLE, title)
        .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
        .putString(MediaMetadata.METADATA_KEY_ALBUM, "Echoo")
        .build()
    )
    session.setPlaybackState(
      PlaybackState.Builder()
        .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
        .build()
    )
    session.isActive = true

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
      .setContentTitle(title)
      .setContentText(contentText)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setCategory(Notification.CATEGORY_TRANSPORT)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      builder.setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken))
    }
    if (contentIntent != null) builder.setContentIntent(contentIntent)
    val notification = builder.build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // A broadcaster needs microphone foreground eligibility while minimized.
      // The service is started on a visible screen after RECORD_AUDIO approval.
      val serviceType = if (kind == "broadcast" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      } else {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      }
      startForeground(
        NOTIFICATION_ID,
        notification,
        serviceType
      )
    } else {
      @Suppress("DEPRECATION")
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun ensureMediaSession(): MediaSession {
    return mediaSession ?: MediaSession(this, "EchooLiveListener").also { session ->
      session.setCallback(object : MediaSession.Callback() {})
      mediaSession = session
    }
  }
}
