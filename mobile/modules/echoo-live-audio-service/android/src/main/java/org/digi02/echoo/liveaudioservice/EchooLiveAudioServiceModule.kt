package org.digi02.echoo.liveaudioservice

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EchooLiveAudioServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EchooLiveAudioService")
    Events("onMediaCommand")
    OnCreate {
      EchooLiveAudioService.onMediaCommand = { action, broadcastId ->
        sendEvent("onMediaCommand", mapOf("action" to action, "broadcastId" to broadcastId))
      }
    }
    OnDestroy { EchooLiveAudioService.onMediaCommand = null }
    Function("setPlaying") { playing: Boolean -> EchooLiveAudioService.setPlaying(playing) }

    Function("start") { title: String, artist: String, broadcastId: String, kind: String ->
      val context = appContext.reactContext ?: return@Function false
      EchooLiveAudioService.start(context, title, artist, broadcastId, kind)
      true
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      EchooLiveAudioService.stop(context)
      true
    }
  }
}
