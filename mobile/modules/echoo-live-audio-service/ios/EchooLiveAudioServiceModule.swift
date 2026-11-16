import ExpoModulesCore
import MediaPlayer

public final class EchooLiveAudioServiceModule: Module {
  private var commandTargets: [(MPRemoteCommand, Any)] = []
  private var broadcastId = ""

  public func definition() -> ModuleDefinition {
    Name("EchooLiveAudioService")
    Events("onMediaCommand")

    Function("setPlaying") { [weak self] (playing: Bool) in
      DispatchQueue.main.async {
        guard let self, !self.broadcastId.isEmpty else { return }
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPNowPlayingInfoPropertyPlaybackRate] = playing ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        MPNowPlayingInfoCenter.default().playbackState = playing ? .playing : .paused
      }
    }

    OnDestroy { [weak self] in
      guard let self else { return }
      DispatchQueue.main.async { self.clearNowPlaying() }
    }

    Function("start") { [weak self] (title: String, artist: String, broadcastId: String, kind: String) -> Bool in
      guard let self else {
        return false
      }
      guard kind == "live" else {
        return true
      }

      DispatchQueue.main.async {
        self.publishLiveNowPlaying(title: title, artist: artist, broadcastId: broadcastId)
      }
      return true
    }

    Function("stop") { [weak self] () -> Bool in
      DispatchQueue.main.async {
        self?.clearNowPlaying()
      }
      return true
    }
  }

  private func publishLiveNowPlaying(title: String, artist: String, broadcastId: String) {
    self.broadcastId = broadcastId
    if commandTargets.isEmpty {
      let center = MPRemoteCommandCenter.shared()
      for (command, action) in [(center.playCommand, "play"), (center.pauseCommand, "pause"), (center.stopCommand, "stop"), (center.togglePlayPauseCommand, "toggle")] {
        let target = command.addTarget { [weak self] _ in
          guard let self, !self.broadcastId.isEmpty else { return .noActionableNowPlayingItem }
          self.sendEvent("onMediaCommand", ["action": action, "broadcastId": self.broadcastId])
          return .success
        }
        command.isEnabled = true
        commandTargets.append((command, target))
      }
    }
    // LiveKit owns AVAudioSession and its WebRTC audio engine. Reconfiguring
    // it here races the active remote track and can make iOS stop playout when
    // the app is backgrounded. This module only owns system media metadata.
    var nowPlaying: [String: Any] = [
      MPMediaItemPropertyTitle: title.isEmpty ? "Live on Echoo" : title,
      MPMediaItemPropertyAlbumTitle: "Echoo",
      MPNowPlayingInfoPropertyIsLiveStream: true,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: 0,
      MPNowPlayingInfoPropertyPlaybackRate: 1.0,
      MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0
    ]
    if !artist.isEmpty {
      nowPlaying[MPMediaItemPropertyArtist] = artist
    }
    if !broadcastId.isEmpty {
      nowPlaying[MPNowPlayingInfoPropertyExternalContentIdentifier] = broadcastId
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlaying
    MPNowPlayingInfoCenter.default().playbackState = .playing
  }

  private func clearNowPlaying() {
    for (command, target) in commandTargets { command.removeTarget(target) }
    commandTargets.removeAll()
    broadcastId = ""
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    MPNowPlayingInfoCenter.default().playbackState = .stopped
  }
}
