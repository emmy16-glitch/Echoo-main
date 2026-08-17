// ... existing imports
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';
import User from '../models/User.js';
import LiveKitProvider from '../providers/livekit.js';
import OvenMediaProvider from '../providers/ovenmedia.js';


// ECHOO_BROADCAST_CRUD_REPAIRED

function broadcastPopulate(query) {
  return query
    .populate(
      'station',
      'name slug coverArt category isLive listenerCount followerCount'
    )
    .populate(
      'creator',
      'username displayName avatar'
    );
}


// ---------------------------------------------------------
// CREATE BROADCAST
// ---------------------------------------------------------

export async function createBroadcast(req, res, next) {
  try {
    const userId = req.userId;

    const {
      title,
      description = '',
      stationId,
      station: stationFromBody,
      startTime,
      endTime,
      type = 'live',
      isRecurring = false,
      recurrencePattern,
      recurrenceDays = [],
      coverArt = null,
      tags = [],
      isPublic = true,
      notes = '',
    } = req.body;

    const resolvedStationId =
      stationId ||
      stationFromBody;

    if (
      !title ||
      !resolvedStationId ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'title, stationId, startTime and endTime are required',
        },
      });
    }

    const start =
      new Date(startTime);

    const end =
      new Date(endTime);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE',
          message:
            'startTime and endTime must be valid dates',
        },
      });
    }

    if (end <= start) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE_RANGE',
          message:
            'endTime must be after startTime',
        },
      });
    }

    const station =
      await Station.findOne({
        _id: resolvedStationId,
        isDeleted: false,
      });

    if (!station) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Station not found',
        },
      });
    }

    if (
      String(station.owner) !==
      String(userId)
    ) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message:
            'You do not own this station',
        },
      });
    }

    const broadcast =
      new Broadcast({
        title: String(title).trim(),
        description,
        station: station._id,
        creator: userId,
        startTime: start,
        endTime: end,

        // Scheduled broadcasts created from Creator Schedule
        // should appear immediately in the schedule.
        status: 'scheduled',

        type,
        isRecurring,
        recurrencePattern,
        recurrenceDays,
        coverArt,
        tags:
          Array.isArray(tags)
            ? tags
            : [],
        isPublic:
          isPublic !== false,
        notes,
      });

    await broadcast.save();

    const populated =
      await broadcastPopulate(
        Broadcast.findById(
          broadcast._id
        )
      );

    return res.status(201).json({
      data: populated,
      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    next(error);
  }
}


// ---------------------------------------------------------
// LIST BROADCASTS
// ---------------------------------------------------------

export async function getBroadcasts(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      stationId,
      status,
      startDate,
      endDate,
      search,
      type,
      isRecurring,
    } = req.query;

    const safePage =
      Math.max(
        1,
        Number(page) || 1
      );

    const safeLimit =
      Math.min(
        100,
        Math.max(
          1,
          Number(limit) || 20
        )
      );

    const filter = {
      isDeleted: false,
    };

    if (stationId) {
      filter.station =
        stationId;
    }

    if (status) {
      filter.status =
        status;
    }

    if (type) {
      filter.type =
        type;
    }

    if (
      isRecurring === 'true' ||
      isRecurring === 'false'
    ) {
      filter.isRecurring =
        isRecurring === 'true';
    }

    if (
      startDate ||
      endDate
    ) {
      filter.startTime = {};

      if (startDate) {
        filter.startTime.$gte =
          new Date(startDate);
      }

      if (endDate) {
        filter.startTime.$lte =
          new Date(endDate);
      }
    }

    if (search) {
      filter.$or = [
        {
          title: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          description: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    const skip =
      (safePage - 1) *
      safeLimit;

    const query =
      Broadcast.find(filter)
        .sort({
          startTime: 1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(safeLimit);

    const broadcasts =
      await broadcastPopulate(
        query
      );

    const total =
      await Broadcast.countDocuments(
        filter
      );

    return res.status(200).json({
      data: broadcasts,

      pagination: {
        page:
          safePage,

        limit:
          safeLimit,

        total,

        totalPages:
          Math.ceil(
            total /
            safeLimit
          ),
      },

      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    next(error);
  }
}


// ---------------------------------------------------------
// GET SINGLE BROADCAST
// ---------------------------------------------------------

export async function getBroadcastById(req, res, next) {
  try {
    const {
      broadcastId,
    } = req.params;

    const broadcast =
      await broadcastPopulate(
        Broadcast.findOne({
          _id:
            broadcastId,

          isDeleted:
            false,
        })
      );

    if (!broadcast) {
      return res.status(404).json({
        error: {
          code:
            'NOT_FOUND',

          message:
            'Broadcast not found',
        },
      });
    }

    return res.status(200).json({
      data:
        broadcast,

      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    next(error);
  }
}


// ---------------------------------------------------------
// UPDATE BROADCAST
// ---------------------------------------------------------

export async function updateBroadcast(req, res, next) {
  try {
    const {
      broadcastId,
    } = req.params;

    const broadcast =
      await Broadcast.findOne({
        _id:
          broadcastId,

        isDeleted:
          false,
      });

    if (!broadcast) {
      return res.status(404).json({
        error: {
          code:
            'NOT_FOUND',

          message:
            'Broadcast not found',
        },
      });
    }

    if (
      String(
        broadcast.creator
      ) !==
      String(
        req.userId
      )
    ) {
      return res.status(403).json({
        error: {
          code:
            'FORBIDDEN',

          message:
            'You do not own this broadcast',
        },
      });
    }

    const allowed = [
      'title',
      'description',
      'startTime',
      'endTime',
      'status',
      'type',
      'isRecurring',
      'recurrencePattern',
      'recurrenceDays',
      'coverArt',
      'tags',
      'isPublic',
      'notes',
    ];

    for (
      const field
      of allowed
    ) {
      if (
        req.body[field] !==
        undefined
      ) {
        broadcast[field] =
          req.body[field];
      }
    }

    if (
      broadcast.startTime &&
      broadcast.endTime &&
      new Date(
        broadcast.endTime
      ) <=
        new Date(
          broadcast.startTime
        )
    ) {
      return res.status(400).json({
        error: {
          code:
            'INVALID_DATE_RANGE',

          message:
            'endTime must be after startTime',
        },
      });
    }

    await broadcast.save();

    const populated =
      await broadcastPopulate(
        Broadcast.findById(
          broadcast._id
        )
      );

    return res.status(200).json({
      data:
        populated,

      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    next(error);
  }
}


// ---------------------------------------------------------
// DELETE BROADCAST
// ---------------------------------------------------------

export async function deleteBroadcast(req, res, next) {
  try {
    const {
      broadcastId,
    } = req.params;

    const broadcast =
      await Broadcast.findOne({
        _id:
          broadcastId,

        isDeleted:
          false,
      });

    if (!broadcast) {
      return res.status(404).json({
        error: {
          code:
            'NOT_FOUND',

          message:
            'Broadcast not found',
        },
      });
    }

    if (
      String(
        broadcast.creator
      ) !==
      String(
        req.userId
      )
    ) {
      return res.status(403).json({
        error: {
          code:
            'FORBIDDEN',

          message:
            'You do not own this broadcast',
        },
      });
    }

    if (
      broadcast.status ===
      'live'
    ) {
      return res.status(400).json({
        error: {
          code:
            'BROADCAST_LIVE',

          message:
            'End the live broadcast before deleting it',
        },
      });
    }

    broadcast.isDeleted =
      true;

    await broadcast.save();

    return res.status(200).json({
      data: {
        message:
          'Broadcast deleted successfully',
      },

      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    next(error);
  }
}


// ---------------------------------------------------------
// UPCOMING BROADCASTS FOR STATION
// ---------------------------------------------------------

export async function getUpcomingBroadcasts(req, res, next) {
  try {
    const {
      stationId,
    } = req.params;

    const broadcasts =
      await broadcastPopulate(
        Broadcast.find({
          station:
            stationId,

          status:
            'scheduled',

          startTime: {
            $gte:
              new Date(),
          },

          isDeleted:
            false,

          isPublic:
            true,
        })
        .sort({
          startTime:
            1,
        })
        .limit(100)
      );

    return res.status(200).json({
      data:
        broadcasts,

      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    next(error);
  }
}


// ---------------------------------------------------------
// CURRENT LIVE BROADCAST FOR STATION
// ---------------------------------------------------------

export async function getLiveBroadcast(req, res, next) {
  try {
    const {
      stationId,
    } = req.params;

    const broadcast =
      await broadcastPopulate(
        Broadcast.findOne({
          station:
            stationId,

          status: {
            $in: [
              'starting',
              'live',
            ],
          },

          isDeleted:
            false,

          isPublic:
            true,
        })
        .sort({
          startedAt:
            -1,

          startTime:
            -1,
        })
      );

    return res.status(200).json({
      data:
        broadcast ||
        null,

      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    next(error);
  }
}



// Start broadcast with LiveKit
export async function startBroadcast(req, res, next) {
  try {
    const { broadcastId } = req.params;
    const userId = req.userId;

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: userId,
      isDeleted: false,
    }).populate('station', 'name');

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' }
      });
    }

    if (broadcast.status === 'live') {
      return res.status(400).json({
        error: { code: 'ALREADY_LIVE', message: 'Broadcast is already live' }
      });
    }

    if (broadcast.status === 'completed') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Cannot start a completed broadcast' }
      });
    }

    // 1. Reset previous runtime failure state and move to STARTING
    broadcast.status = 'starting';
    broadcast.failureReason = null;
    broadcast.startedAt = null;
    broadcast.endedAt = null;
    broadcast.livekitEgressId = null;
    broadcast.livekitRoomName = null;
    await broadcast.save();

    try {
      // 2. Create LiveKit room
      const room = await LiveKitProvider.createRoom(broadcastId);
      
      // 3. Generate creator token
      const user = await User.findById(userId);
      const token = await LiveKitProvider.generateCreatorToken(
        broadcastId,
        userId,
        user?.displayName || user?.username || 'Echoo Creator'
      );

      // 4. Decide media relay mode.
      //
      // Production/default:
      //   LiveKit -> Egress -> OvenMediaEngine
      //
      // Development:
      //   LiveKit only, so the browser can publish microphone audio
      //   even when Egress/OME are not installed.
      const mediaRelayMode = String(
        process.env.MEDIA_RELAY_MODE || 'required'
      ).toLowerCase();

      const liveKitOnly = mediaRelayMode === 'livekit-only';

      let ingestUrl = null;
      let playbackUrls = null;

      if (liveKitOnly) {
        console.warn(
          `[Echoo] Broadcast ${broadcastId} starting in LiveKit-only mode. ` +
          'OME listener playback is unavailable.'
        );

        broadcast.livekitEgressId = null;
      } else {
        // 5. Production relay: LiveKit -> Egress -> OME
        ingestUrl = OvenMediaProvider.getIngestUrl(
          broadcastId,
          'rtmp'
        );

        const egress = await LiveKitProvider.startEgress(
          broadcastId,
          broadcast.title,
          ingestUrl
        );

        broadcast.livekitEgressId = egress.egressId;
        playbackUrls = OvenMediaProvider.getPlaybackUrls(
          broadcastId
        );
      }

      // The LiveKit room exists in both modes.
      broadcast.livekitRoomName = room.name;
      await broadcast.save();

      // 6. Do NOT block here waiting for OME.
      //
      // The creator still needs the LiveKit token returned below
      // before the browser can publish microphone audio.
      //
      // OME readiness must therefore be checked after publishing,
      // not before returning the creator token.



      // 7. Mark as LIVE
      broadcast.status = 'live';
      broadcast.startedAt = new Date();
      await broadcast.save();

      // 8. Update station live status
      await Station.findByIdAndUpdate(broadcast.station?._id || broadcast.station, { isLive: true });

      // 9. Emit Socket.IO event
      if (req.app.get('io')) {
        const io = req.app.get('io');
        io.to(`broadcast:${broadcastId}`).emit('broadcast:status', {
          broadcastId,
          status: 'live',
          startedAt: broadcast.startedAt,
        });
      }

      // 10. Return token to client
      return res.status(200).json({
        data: {
          broadcast,
          token, // Frontend uses this to connect to LiveKit
          roomName: room.name,
          ingestUrl,
          playbackUrls,
          mediaMode: liveKitOnly ? 'livekit-only' : 'livekit-ome',
          relayAvailable: !liveKitOnly,
        },
        message: 'Broadcast is now live!',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      // If setup fails, mark as failed
      console.error('Broadcast start error:', error);
      broadcast.status = 'failed';
      broadcast.failureReason = error.message || 'Unknown error during start';
      await broadcast.save();
      throw error;
    }
  } catch (error) {
    console.error('Start broadcast error:', error);
    next(error);
  }
}

// Get LiveKit token for creator
export async function getLiveKitToken(req, res, next) {
  try {
    const { broadcastId } = req.params;
    const userId = req.userId;

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: userId,
      isDeleted: false,
    });

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' }
      });
    }

    if (broadcast.status !== 'starting' && broadcast.status !== 'live') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Broadcast must be starting or live' }
      });
    }

    const user = await User.findById(userId);
    const token = await LiveKitProvider.generateCreatorToken(
      broadcastId,
      userId,
      user?.displayName || user?.username || 'Echoo Creator'
    );

    return res.status(200).json({
      data: {
        token,
        roomName: broadcast.livekitRoomName || LiveKitProvider.getRoomName(broadcastId),
        broadcastId,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get LiveKit token error:', error);
    next(error);
  }
}

// Get playback info for listeners
export async function getPlaybackInfo(req, res, next) {
  try {
    const { broadcastId } = req.params;

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      isDeleted: false,
    });

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' }
      });
    }

    if (broadcast.status !== 'live' && broadcast.status !== 'starting') {
      return res.status(400).json({
        error: { code: 'NOT_LIVE', message: 'Broadcast is not live' }
      });
    }

    const playbackUrls = OvenMediaProvider.getPlaybackUrls(broadcastId);

    return res.status(200).json({
      data: {
        broadcastId,
        status: broadcast.status,
        playbackUrls,
        startedAt: broadcast.startedAt,
        title: broadcast.title,
        station: broadcast.station,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get playback info error:', error);
    next(error);
  }
}

// End broadcast
export async function endBroadcast(req, res, next) {
  try {
    const { broadcastId } = req.params;
    const userId = req.userId;

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: userId,
      isDeleted: false,
    });

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' }
      });
    }

    if (broadcast.status !== 'live') {
      return res.status(400).json({
        error: { code: 'NOT_LIVE', message: 'Broadcast is not currently live' }
      });
    }

    // Change status to ENDING
    broadcast.status = 'ending';
    await broadcast.save();

    try {
      // Stop Egress
      if (broadcast.livekitEgressId) {
        await LiveKitProvider.stopEgress(broadcast.livekitEgressId);
      }

      // End room
      await LiveKitProvider.endRoom(broadcastId);

      // Update station live status
      await Station.findByIdAndUpdate(broadcast.station?._id || broadcast.station, { isLive: false });

      // Mark as completed
      broadcast.status = 'completed';
      broadcast.endedAt = new Date();
      await broadcast.save();

      // Emit Socket.IO event
      if (req.app.get('io')) {
        const io = req.app.get('io');
        io.to(`broadcast:${broadcastId}`).emit('broadcast:status', {
          broadcastId,
          status: 'completed',
          endedAt: broadcast.endedAt,
        });
      }

      return res.status(200).json({
        data: {
          broadcast,
          message: 'Broadcast ended successfully',
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('End broadcast error:', error);
      broadcast.status = 'failed';
      broadcast.failureReason = error.message || 'Error during end broadcast';
      await broadcast.save();
      throw error;
    }
  } catch (error) {
    console.error('End broadcast error:', error);
    next(error);
  }
}
