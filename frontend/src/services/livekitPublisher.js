import {
  Room,
  Track,
} from "livekit-client";

let activeRoom = null;
let activeBroadcastId = null;

let syntheticContext = null;
let syntheticOscillator = null;
let syntheticNativeTrack = null;

const syntheticModeEnabled =
  () =>
    import.meta.env
      .VITE_SYNTHETIC_AUDIO ===
    "true";

const createSyntheticTrack =
  async () => {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error(
        "This browser does not support Web Audio."
      );
    }

    syntheticContext =
      new AudioContextClass();

    await syntheticContext.resume();

    const oscillator =
      syntheticContext
        .createOscillator();

    const gain =
      syntheticContext
        .createGain();

    const destination =
      syntheticContext
        .createMediaStreamDestination();

    oscillator.type =
      "sine";

    oscillator.frequency.value =
      440;

    // Quiet test signal.
    gain.gain.value =
      0.02;

    oscillator.connect(gain);
    gain.connect(destination);

    oscillator.start();

    const nativeTrack =
      destination.stream
        .getAudioTracks()[0];

    if (!nativeTrack) {
      throw new Error(
        "Could not create Echoo synthetic audio track."
      );
    }

    syntheticOscillator =
      oscillator;

    syntheticNativeTrack =
      nativeTrack;

    return nativeTrack;
  };

const cleanupSyntheticAudio =
  async () => {
    try {
      syntheticNativeTrack
        ?.stop();
    } catch {
      // Ignore cleanup error.
    }

    try {
      syntheticOscillator
        ?.stop();
    } catch {
      // Ignore cleanup error.
    }

    try {
      await syntheticContext
        ?.close();
    } catch {
      // Ignore cleanup error.
    }

    syntheticNativeTrack = null;
    syntheticOscillator = null;
    syntheticContext = null;
  };

export const getLiveKitPublishingState =
  () => ({
    connected:
      Boolean(activeRoom),

    broadcastId:
      activeBroadcastId,

    roomName:
      activeRoom?.name ||
      null,

    mode:
      syntheticModeEnabled()
        ? "synthetic-test"
        : "microphone",
  });

export const stopLiveKitPublishing =
  async () => {
    const room =
      activeRoom;

    activeRoom = null;
    activeBroadcastId = null;

    if (room) {
      try {
        await room.disconnect();
      } catch (error) {
        console.warn(
          "Could not disconnect LiveKit room:",
          error
        );
      }
    }

    await cleanupSyntheticAudio();
  };

export const startLiveKitPublishing =
  async ({
    url,
    token,
    broadcastId,
  }) => {
    if (!url) {
      throw new Error(
        "VITE_LIVEKIT_URL is not configured."
      );
    }

    if (!token) {
      throw new Error(
        "Echoo did not return a LiveKit token."
      );
    }

    await stopLiveKitPublishing();

    const room =
      new Room();

    try {
      await room.connect(
        url,
        token
      );

      const useSynthetic =
        syntheticModeEnabled();

      let publication;

      if (useSynthetic) {
        const nativeTrack =
          await createSyntheticTrack();

        publication =
          await room
            .localParticipant
            .publishTrack(
              nativeTrack,
              {
                name:
                  "echoo-dev-test-audio",

                source:
                  Track.Source
                    .Microphone,
              }
            );
      } else {
        publication =
          await room
            .localParticipant
            .setMicrophoneEnabled(
              true
            );
      }

      activeRoom =
        room;

      activeBroadcastId =
        String(
          broadcastId ||
          ""
        );

      const result = {
        connected:
          true,

        roomName:
          room.name,

        identity:
          room
            .localParticipant
            .identity,

        trackSid:
          publication?.trackSid ||
          null,

        mode:
          useSynthetic
            ? "synthetic-test"
            : "microphone",
      };

      console.log(
        "[Echoo LiveKit] publishing",
        result
      );

      return result;
    } catch (error) {
      try {
        await room.disconnect();
      } catch {
        // Ignore cleanup error.
      }

      await cleanupSyntheticAudio();

      throw error;
    }
  };

export default {
  startLiveKitPublishing,
  stopLiveKitPublishing,
  getLiveKitPublishingState,
};
