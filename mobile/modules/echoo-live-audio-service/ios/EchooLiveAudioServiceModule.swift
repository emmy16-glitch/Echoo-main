import ExpoModulesCore
import MediaPlayer

public final class EchooLiveAudioServiceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EchooLiveAudioService")

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
  }

  private func clearNowPlaying() {
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }
}
