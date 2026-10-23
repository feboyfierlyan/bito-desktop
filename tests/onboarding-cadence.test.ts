import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConversationCadence,
  conversationTiming,
} from "../src/onboarding-cadence";

test("Bito waits for the user bubble to land before starting his response", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const cadence = new ConversationCadence();
  const messages = ["user"];
  cadence.schedule(conversationTiming.reply, () => messages.push("bito"));
  t.mock.timers.tick(conversationTiming.reply - 1);
  assert.deepEqual(messages, ["user"]);
  t.mock.timers.tick(1);
  assert.deepEqual(messages, ["user", "bito"]);
});

test("back navigation cancels a pending response and its follow-up instruction", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const cadence = new ConversationCadence();
  let messages = 0;
  cadence.schedule(conversationTiming.reply, () => {
    messages += 1;
    cadence.schedule(conversationTiming.nextMessage, () => (messages += 1));
  });
  t.mock.timers.tick(100);
  cadence.cancel();
  t.mock.timers.tick(2000);
  assert.equal(messages, 0);
  cadence.schedule(conversationTiming.reply, () => {
    messages += 1;
    cadence.schedule(conversationTiming.nextMessage, () => (messages += 1));
  });
  t.mock.timers.tick(conversationTiming.reply);
  cadence.cancel();
  t.mock.timers.tick(2000);
  assert.equal(messages, 1);
});

test("rapid forward/back/forward retains only the newest scheduled conversation", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const cadence = new ConversationCadence();
  const messages: string[] = [];
  cadence.schedule(340, () => messages.push("stale reply"));
  t.mock.timers.tick(100);
  cadence.cancel();
  cadence.schedule(340, () => messages.push("current reply"));
  t.mock.timers.tick(1000);
  assert.deepEqual(messages, ["current reply"]);
});
