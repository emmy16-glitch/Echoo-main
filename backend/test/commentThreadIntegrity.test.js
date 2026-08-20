import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = (relativePath) =>
  fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('comment threads support exactly one visible reply level', async () => {
  const controller = await source('src/controllers/commentController.js');

  assert.match(controller, /select\(['"]_id parentCommentId['"]\)/);
  assert.match(controller, /NESTED_REPLY_NOT_SUPPORTED/);
  assert.match(controller, /parentComment\.parentCommentId/);
  assert.match(controller, /replyCount:/);
});

test('full direct replies are pageable instead of silently disappearing', async () => {
  const controller = await source('src/controllers/commentController.js');
  const routes = await source('src/routes/commentRoutes.js');

  assert.match(controller, /export async function getCommentReplies/);
  assert.match(controller, /parentCommentId:\s*parent\._id/);
  assert.match(routes, /['"]\/:commentId\/replies['"],\s*getCommentReplies/);
});

test('deleting a root comment also reconciles direct replies and commentCount', async () => {
  const controller = await source('src/controllers/commentController.js');

  assert.match(controller, /Comment\.updateMany/);
  assert.match(controller, /parentCommentId:\s*comment\._id/);
  assert.match(controller, /deletedCount\s*\+=\s*Number\(replies\.modifiedCount\)/);
  assert.match(controller, /decrementCommentCountBestEffort\(comment\.audioId, deletedCount\)/);
  assert.match(controller, /\$max:/);
  assert.match(controller, /\$subtract:/);
});

test('comment model indexes direct thread reads', async () => {
  const model = await source('src/models/Comment.js');
  assert.match(
    model,
    /commentSchema\.index\(\{ audioId: 1, parentCommentId: 1, isDeleted: 1, createdAt: 1 \}\)/
  );
});
