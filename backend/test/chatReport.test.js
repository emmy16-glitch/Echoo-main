import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import ChatMessage from '../src/models/ChatMessage.js';
import ChatReport from '../src/models/ChatReport.js';
import Broadcast from '../src/models/Broadcast.js';
import { reportMessage } from '../src/controllers/chatController.js';

afterEach(() => mock.restoreAll());

const messageId = '6aca9d889da9a1458128098b';
const broadcastId = '6aca9d889da9a1458128098c';
const authorId = '6aca9d889da9a1458128098d';
const reporterId = '6aca9d889da9a1458128098e';

function request(reason = 'Spam or misleading content') {
  return { params: { messageId }, body: { reason }, userId: reporterId };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function mockAccess() {
  mock.method(ChatMessage, 'findOne', async () => ({ _id: messageId, broadcastId, userId: authorId }));
  mock.method(Broadcast, 'findOne', () => ({ select: async () => ({
    _id: broadcastId, creator: authorId, isPublic: true,
  }) }));
}

test('a report acknowledges only a stored, accessible comment report', async () => {
  mockAccess();
  const write = mock.method(ChatReport, 'findOneAndUpdate', async () => ({ _id: messageId }));
  const res = response();
  let error;
  await reportMessage(request(), res, (value) => { error = value; });
  assert.equal(error, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.submitted, true);
  assert.equal(write.mock.callCount(), 1);
  assert.equal(write.mock.calls[0].arguments[0].reporterId, reporterId);
});

test('a failed report write never acknowledges submission', async () => {
  mockAccess();
  mock.method(ChatReport, 'findOneAndUpdate', async () => { throw new Error('database unavailable'); });
  const res = response();
  let error;
  await reportMessage(request(), res, (value) => { error = value; });
  assert.equal(res.body, null);
  assert.equal(error?.message, 'database unavailable');
});

test('an unsupported reason is rejected before reading a comment', async () => {
  const read = mock.method(ChatMessage, 'findOne', async () => null);
  let error;
  await reportMessage(request('unknown'), response(), (value) => { error = value; });
  assert.equal(error?.status, 400);
  assert.equal(read.mock.callCount(), 0);
});
