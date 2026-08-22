import test from 'node:test';
import assert from 'node:assert/strict';
import { containsCodeLikeContent, validateHumanText } from '../src/utils/humanTextValidation.js';

test('human text validator accepts ordinary prose', () => {
  assert.equal(containsCodeLikeContent('I enjoy discovering new music.'), false);
  assert.equal(
    validateHumanText('I enjoy discovering new music.', {
      maxLength: 500,
      requiredMessage: 'required',
      codeMessage: 'code',
    }),
    null
  );
});

test('human text validator rejects common code forms', () => {
  const examples = [
    '```js\nalert(1)\n```',
    '<script>alert(1)</script>',
    'const password = process.env.SECRET;',
    'SELECT * FROM users;',
    'const add = (a, b) => a + b;',
  ];

  for (const example of examples) {
    assert.equal(containsCodeLikeContent(example), true, example);
  }
});

test('human text validator enforces type and length', () => {
  const options = {
    maxLength: 10,
    requiredMessage: 'required',
    codeMessage: 'code',
  };
  assert.equal(validateHumanText(123, options), 'required');
  assert.equal(validateHumanText('12345678901', options), 'Text cannot exceed 10 characters');
  assert.equal(validateHumanText('const x = 1;', { ...options, maxLength: 100 }), 'code');
});
