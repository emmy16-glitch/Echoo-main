import crypto from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { AccessToken } from "livekit-server-sdk";

import Broadcast from "../models/Broadcast.js";

const router = express.Router();

const errorResponse = (
  res,
  status,
  code,
  message
) => {
  return res.status(status).json({
    error: {
      code,
      message,
    },
  });
};

router.post(
  "/:broadcastId/listener-token",
  async (req, res, next) => {
    try {
      const {
        broadcastId,
      } = req.params;

      /*
       * Important:
       * Reject slugs / malformed IDs before Mongoose receives them.
       * This avoids CastError crashes such as "faith-talk-live".
       */
      if (
        !mongoose.isValidObjectId(
          broadcastId
        )
      ) {
        return errorResponse(
          res,
          400,
          "INVALID_BROADCAST_ID",
          "Invalid broadcast ID."
        );
      }

      const broadcast =
        await Broadcast
          .findById(
            broadcastId
          )
          .select(
            "_id title status isPublic livekitRoomName"
          )
          .lean();

      if (!broadcast) {
        return errorResponse(
          res,
          404,
          "BROADCAST_NOT_FOUND",
          "Broadcast not found."
        );
      }

      if (
        broadcast.status !==
        "live"
      ) {
        return errorResponse(
          res,
          409,
          "BROADCAST_NOT_LIVE",
          "This broadcast is not live."
        );
      }

      if (
        broadcast.isPublic ===
        false
      ) {
        return errorResponse(
          res,
          403,
          "BROADCAST_PRIVATE",
          "This broadcast is not publicly available."
        );
      }

      if (
        !broadcast.livekitRoomName
      ) {
        return errorResponse(
          res,
          409,
          "LIVEKIT_ROOM_UNAVAILABLE",
          "The live audio room is not ready."
        );
      }

      const livekitUrl =
        process.env
          .LIVEKIT_PUBLIC_URL ||
        process.env
          .LIVEKIT_URL ||
        "";

      const apiKey =
        process.env
          .LIVEKIT_API_KEY;

      const apiSecret =
        process.env
          .LIVEKIT_API_SECRET;

      if (
        !livekitUrl ||
        !apiKey ||
        !apiSecret
      ) {
        return errorResponse(
          res,
          503,
          "LIVEKIT_NOT_CONFIGURED",
          "Echoo live audio is not configured."
        );
      }

      /*
       * This identity is an internal LiveKit participant identity.
       * It has NOTHING to do with Follow / Subscribe UI.
       */
      const identity =
        `listener-${crypto.randomUUID()}`;

      const accessToken =
        new AccessToken(
          apiKey,
          apiSecret,
          {
            identity,
            name: "Echoo Listener",
            ttl: "6h",
          }
        );

      /*
       * Listener permissions:
       *
       * - Join room: YES
       * - Receive audio: YES
       * - Publish microphone: NO
       * - Publish data: NO
       */
      accessToken.addGrant({
        roomJoin: true,
        room:
          broadcast
            .livekitRoomName,
        canSubscribe: true,
        canPublish: false,
        canPublishData: false,
      });

      const token =
        await accessToken.toJwt();

      return res.json({
        success: true,

        data: {
          token,

          roomName:
            broadcast
              .livekitRoomName,

          livekitUrl,

          broadcastId:
            String(
              broadcast._id
            ),

          mediaMode:
            "livekit-direct",

          role:
            "listener",
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
