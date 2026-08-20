import mongoose from 'mongoose';
import {
  boundedSearchText,
  escapeRegexLiteral,
} from '../utils/queryText.js';

const BROADCAST_STATUSES = new Set([
  'draft',
  'scheduled',
  'starting',
  'live',
  'ending',
  'completed',
  'cancelled',
  'failed',
]);

const BROADCAST_TYPES = new Set(['live', 'recorded', 'recurring', 'special']);

export { escapeRegexLiteral };

const badRequest = (res, code, message) =>
  res.status(400).json({ error: { code, message } });

export function validateStationIdParam(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.stationId)) {
    return badRequest(res, 'INVALID_STATION_ID', 'Invalid station ID');
  }
  return next();
}

export function validateBroadcastListQuery(req, res, next) {
  const { stationId, status, type, startDate, endDate } = req.query;

  if (stationId && !mongoose.isValidObjectId(stationId)) {
    return badRequest(res, 'INVALID_STATION_ID', 'Invalid station ID');
  }

  if (status && !BROADCAST_STATUSES.has(String(status))) {
    return badRequest(res, 'INVALID_STATUS', 'Invalid broadcast status');
  }

  if (type && !BROADCAST_TYPES.has(String(type))) {
    return badRequest(res, 'INVALID_BROADCAST_TYPE', 'Invalid broadcast type');
  }

  for (const [name, value] of [
    ['startDate', startDate],
    ['endDate', endDate],
  ]) {
    if (value && Number.isNaN(new Date(value).getTime())) {
      return badRequest(res, 'INVALID_DATE', `${name} must be a valid date`);
    }
  }

  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    return badRequest(
      res,
      'INVALID_DATE_RANGE',
      'endDate must be on or after startDate'
    );
  }

  if (req.query.search !== undefined) {
    try {
      const search = boundedSearchText(req.query.search, { maxLength: 120 });
      req.query.search = escapeRegexLiteral(search);
    } catch (error) {
      return badRequest(
        res,
        error.code || 'SEARCH_TOO_LONG',
        error.message || 'Invalid search text'
      );
    }
  }

  return next();
}
