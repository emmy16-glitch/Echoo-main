import Broadcast from '../models/Broadcast.js';
import Audio from '../models/Audio.js';
import LiveKitProvider from '../providers/livekit.js';
import OvenMediaProvider from '../providers/ovenmedia.js';

export async function processPrerecordedBroadcast(broadcastId) {
  try {
    const broadcast = await Broadcast.findById(broadcastId)
      .populate('station', 'name')
      .populate('scheduledAudioId', 'fileUrl title');

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    if (broadcast.scheduledType !== 'prerecorded' || !broadcast.scheduledAudioId) {
      throw new Error('Not a prerecorded broadcast or no audio file selected');
    }

    // Get the audio file URL
    const audioUrl = broadcast.scheduledAudioId.fileUrl;
    if (!audioUrl) {
      throw new Error('Audio file not found');
    }

    // 1. Create LiveKit room
    const room = await LiveKitProvider.createRoom(broadcastId);
    
    // 2. Get system token for ingress
    const token = await LiveKitProvider.generateSystemToken(broadcastId);
    
    // 3. Start URL_INPUT Ingress
    const ingress = await LiveKitProvider.startUrlIngress(
      broadcastId,
      audioUrl
    );
    
    // 4. Get OME ingest URL
    const ingestUrl = OvenMediaProvider.getIngestUrl(broadcastId, 'srt');
    
    // 5. Start Egress to OME
    const egress = await LiveKitProvider.startEgress(
      broadcastId,
      broadcast.title,
      ingestUrl
    );
    
    // 6. Store ingress/egress IDs
    broadcast.livekitIngressId = ingress.ingressId;
    broadcast.livekitEgressId = egress.egressId;
    broadcast.livekitRoomName = room.name;
    broadcast.status = 'starting';
    await broadcast.save();
    
    // 7. Wait for OME to receive stream
    let omeReady = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts && !omeReady) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      omeReady = await OvenMediaProvider.checkStreamStatus(broadcastId);
      attempts++;
    }

    if (!omeReady) {
      broadcast.status = 'failed';
      broadcast.failureReason = 'OME stream not ready for prerecorded broadcast';
      await broadcast.save();
      throw new Error('OME stream not ready');
    }

    // 8. Mark as live
    broadcast.status = 'live';
    broadcast.startedAt = new Date();
    await broadcast.save();

    // 9. Update station live status
    await Station.findByIdAndUpdate(broadcast.station, { isLive: true });

    // 10. Notify followers (implement with notification service)

    return {
      success: true,
      broadcast,
      message: 'Prerecorded broadcast is now live',
    };

  } catch (error) {
    console.error('Prerecorded broadcast error:', error);
    
    // Update broadcast status to failed
    const broadcast = await Broadcast.findById(broadcastId);
    if (broadcast) {
      broadcast.status = 'failed';
      broadcast.failureReason = error.message || 'Prerecorded broadcast failed';
      await broadcast.save();
    }
    
    throw error;
  }
}
