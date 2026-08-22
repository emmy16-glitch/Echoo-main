import Feedback from '../models/Feedback.js';

const MAX_FEEDBACK_LENGTH = 2000;

export async function createFeedback(req, res, next) {
  const { message } = req.body || {};

  if (typeof message !== 'string') {
    return res.status(400).json({
      error: { code: 'INVALID_FEEDBACK', message: 'Invalid feedback' },
    });
  }

  const cleanMessage = message.trim();
  if (!cleanMessage) {
    return res.status(400).json({
      error: { code: 'INVALID_FEEDBACK', message: 'Invalid feedback' },
    });
  }

  if (cleanMessage.length > MAX_FEEDBACK_LENGTH) {
    return res.status(400).json({
      error: { code: 'FEEDBACK_TOO_LONG', message: 'Feedback is too long' },
    });
  }

  try {
    // Mongoose serializes this document through the driver’s bound parameters;
    // no user input is interpolated into a database command.
    const feedback = await Feedback.create({
      message: cleanMessage,
      submittedBy: req.userId,
    });

    return res.status(201).json({
      data: {
        id: feedback.id,
        message: 'Feedback submitted successfully',
      },
    });
  } catch (error) {
    console.error('Feedback submission failed:', error?.message || error);
    return res.status(500).json({
      error: {
        code: 'FEEDBACK_SUBMISSION_FAILED',
        message: 'Unable to submit feedback',
      },
    });
  }
}
