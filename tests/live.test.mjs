import test from "node:test";
import assert from "node:assert/strict";
import { closedMinutes, marketSignal } from "../lib/live.ts";
const now = 1800000000000;
const bars = Array.from(
  {
    length: 61,
  },
  (_, i) => {
    const t = now - (60 - i) * 60000;
    return [t, 100 + i, 102 + i, 99 + i, 101 + i, 1, t + 59999];
  },
);
test("excludes incomplete minute and rejects stale or missing candles", () => {
  const c = closedMinutes(bars, now);
  assert.equal(c.length, 60);
  assert.equal(c.at(-1).closeTime, now - 1);
  assert.throws(() => closedMinutes(bars, now + 180000));
  assert.throws(() =>
    closedMinutes(
      bars.filter((_, i) => i !== 40),
      now,
    ),
  );
});
test("three-way signal returns the model choice without a position filter", () => {
  assert.equal(
    marketSignal("buy", {
      buy: 0.5,
      sell: 0.3,
      wait: 0.2,
    }),
    "buy",
  );
  assert.equal(
    marketSignal("sell", {
      buy: 0.1,
      sell: 0.8,
      wait: 0.1,
    }),
    "sell",
  );
  assert.equal(
    marketSignal("wait", {
      buy: 0.2,
      sell: 0.3,
      wait: 0.5,
    }),
    "wait",
  );
  assert.throws(() =>
    marketSignal("hold", {
      buy: 0.2,
      sell: 0.3,
      wait: 0.5,
    }),
  );
  assert.throws(() =>
    marketSignal("buy", {
      buy: 0.9,
      sell: 0.9,
      wait: 0.1,
    }),
  );
  assert.throws(() =>
    marketSignal("buy", {
      buy: NaN,
      sell: 0.3,
      wait: 0.5,
    }),
  );
});
test("preserves OHLC and rejects impossible candles", () => {
  const c = closedMinutes(bars, now)[0];
  assert.equal(c.open, 100);
  assert.equal(c.high, 102);
  assert.equal(c.low, 99);
  assert.equal(c.close, 101);
  const bad = structuredClone(bars);
  bad[0][2] = 90;
  assert.throws(() => closedMinutes(bad, now));
});
