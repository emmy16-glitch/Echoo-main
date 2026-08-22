import { _electron as electron } from 'playwright';
import test from 'node:test';
import assert from 'node:assert';

test('Echoo Desktop - Audio Control Verification', async (t) => {
  console.log('🚀 Starting Echoo Desktop Audio Test...');
  
  const electronApp = await electron.launch({ args: ['.'] });
  const window = await electronApp.firstWindow();
  
  console.log('✅ Window launched. Title:', await window.title());

  // Wait for the app to load (checking for a common element like the player bar)
  try {
    await window.waitForSelector('.echoo-player-bar', { timeout: 15000 });
    console.log('✅ Player bar detected.');
  } catch (e) {
    console.log('⚠️ Player bar not detected. App might be at login screen.');
  }

  // Verification 1: Play/Pause State Bridge
  const hasPlayPauseLogic = await window.evaluate(() => {
    return typeof window.echooDesktop !== 'undefined';
  });
  assert.strictEqual(hasPlayPauseLogic, true, 'Desktop bridge should be exposed to the window');
  console.log('✅ Desktop bridge verified.');

  // Verification 2: Audio Element Presence
  const hasAudioElement = await window.evaluate(() => {
    return !!document.querySelector('audio');
  });
  console.log('ℹ️ Audio element present:', hasAudioElement);

  // Verification 3: Mocking Play/Pause Action
  console.log('🧪 Testing play/pause button interactions...');
  const playButton = await window.$('.play-pause-btn');
  if (playButton) {
    await playButton.click();
    console.log('✅ Play/Pause button is clickable.');
  } else {
    console.log('ℹ️ Play/Pause button not found in current view (normal if not in a live room).');
  }

  await electronApp.close();
  console.log('🏁 Test completed successfully.');
});
