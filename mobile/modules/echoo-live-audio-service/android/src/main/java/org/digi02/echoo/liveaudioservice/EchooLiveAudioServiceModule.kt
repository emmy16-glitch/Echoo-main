package org.digi02.echoo.liveaudioservice

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EchooLiveAudioServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EchooLiveAudioService")

    Function("start") { title: String, artist: String, broadcastId: String ->
      val context = appContext.reactContext ?: return@Function false
      EchooLiveAudioService.start(context, title, artist, broadcastId)
      true
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      EchooLiveAudioService.stop(context)
      true
    }
  }
}
