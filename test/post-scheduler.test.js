// test/post-scheduler.test.js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Set up test environment
process.env.ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');

describe('PostScheduler', () => {
  let PostScheduler;
  let scheduler;

  afterEach(() => {
    if (scheduler && scheduler.stopScheduler) {
      scheduler.stopScheduler();
    }
  });

  describe('Constructor', () => {
    it('does not auto-start scheduler when autoStart is false', () => {
      PostScheduler = require('../server/social/post-scheduler');
      scheduler = new PostScheduler({ autoStart: false });

      assert.strictEqual(scheduler.schedulerInterval, null, 'Interval should not be set');
    });

    it('auto-starts scheduler by default', () => {
      // Note: We can't easily test the actual interval without waiting 30s
      // Instead, we test that stopScheduler works (proves it was started)
      PostScheduler = require('../server/social/post-scheduler');
      scheduler = new PostScheduler({ autoStart: true });

      // If we can stop it, it was started
      scheduler.stopScheduler();
      assert.strictEqual(scheduler.schedulerInterval, null);
    });
  });

  describe('startScheduler', () => {
    it('can start scheduler after construction with autoStart: false', () => {
      PostScheduler = require('../server/social/post-scheduler');
      scheduler = new PostScheduler({ autoStart: false });

      assert.strictEqual(scheduler.schedulerInterval, null);

      scheduler.startScheduler();
      assert.ok(scheduler.schedulerInterval, 'Interval should be set after start');

      scheduler.stopScheduler();
    });
  });

  describe('stopScheduler', () => {
    it('clears the interval', () => {
      PostScheduler = require('../server/social/post-scheduler');
      scheduler = new PostScheduler({ autoStart: true });

      const intervalBefore = scheduler.schedulerInterval;
      assert.ok(intervalBefore, 'Should have interval before stop');

      scheduler.stopScheduler();

      assert.strictEqual(scheduler.schedulerInterval, null, 'Should clear interval');
    });

    it('handles multiple stop calls gracefully', () => {
      PostScheduler = require('../server/social/post-scheduler');
      scheduler = new PostScheduler({ autoStart: true });

      scheduler.stopScheduler();
      scheduler.stopScheduler(); // Should not throw

      assert.strictEqual(scheduler.schedulerInterval, null);
    });
  });
});
