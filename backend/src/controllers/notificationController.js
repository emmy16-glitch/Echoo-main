import Notification from '../models/Notification.js';

// Get notifications
export async function getNotifications(req, res, next) {
  try {
    const userId = req.userId;
    const {
      page = 1,
      limit = 20,
      unreadOnly = false,
    } = req.query;

    const safePage = Math.max(
      1,
      parseInt(page) || 1
    );

    const safeLimit = Math.min(
      100,
      Math.max(
        1,
        parseInt(limit) || 20
      )
    );

    const skip =
      (safePage - 1) *
      safeLimit;

    const filter = {
      userId,
      isDeleted: false,
    };

    if (
      unreadOnly === true ||
      unreadOnly === 'true'
    ) {
      filter.read = false;
    }

    const notifications =
      await Notification.find(filter)
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(safeLimit);

    const total =
      await Notification.countDocuments(
        filter
      );

    const unreadCount =
      await Notification.countDocuments({
        userId,
        isDeleted: false,
        read: false,
      });

    return res.status(200).json({
      data: {
        notifications,
        unreadCount,

        pagination: {
          page: safePage,
          limit: safeLimit,
          total,

          totalPages:
            Math.ceil(
              total /
              safeLimit
            ),
        },
      },

      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    console.error(
      'Get notifications error:',
      error
    );

    next(error);
  }
}


// Mark one notification as read
export async function markAsRead(req, res, next) {
  try {
    const userId = req.userId;

    const {
      notificationId,
    } = req.params;

    const notification =
      await Notification.findOne({
        _id: notificationId,
        userId,
        isDeleted: false,
      });

    if (!notification) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message:
            'Notification not found',
        },
      });
    }

    notification.read = true;
    notification.readAt =
      new Date();

    await notification.save();

    return res.status(200).json({
      data: {
        notification,

        message:
          'Notification marked as read',
      },

      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    console.error(
      'Mark notification as read error:',
      error
    );

    next(error);
  }
}


// Mark all notifications as read
export async function markAllAsRead(
  req,
  res,
  next
) {
  try {
    const userId =
      req.userId;

    await Notification.updateMany(
      {
        userId,
        read: false,
        isDeleted: false,
      },
      {
        $set: {
          read: true,
          readAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      data: {
        message:
          'All notifications marked as read',
      },

      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    console.error(
      'Mark all notifications as read error:',
      error
    );

    next(error);
  }
}


// Soft-delete one notification
export async function deleteNotification(
  req,
  res,
  next
) {
  try {
    const userId =
      req.userId;

    const {
      notificationId,
    } = req.params;

    const notification =
      await Notification.findOne({
        _id: notificationId,
        userId,
        isDeleted: false,
      });

    if (!notification) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',

          message:
            'Notification not found',
        },
      });
    }

    notification.isDeleted =
      true;

    await notification.save();

    return res.status(200).json({
      data: {
        message:
          'Notification deleted',
      },

      timestamp:
        new Date().toISOString(),
    });

  } catch (error) {
    console.error(
      'Delete notification error:',
      error
    );

    next(error);
  }
}


// Internal helper for creating notifications
export async function createNotification(
  userId,
  type,
  title,
  message,
  link = null,
  metadata = {}
) {
  try {
    const notification =
      new Notification({
        userId,
        type,
        title,
        message,
        link,
        metadata,
        read: false,
      });

    await notification.save();

    return notification;

  } catch (error) {
    console.error(
      'Create notification error:',
      error
    );

    return null;
  }
}
