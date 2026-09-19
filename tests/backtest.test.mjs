import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPortfolio,
  advance,
  features,
  demoCandles,
} from "../lib/backtest.ts";
const input = {
  date: "2024-01-01",
  close: 100,
  sma5: 100,
  sma20: 90,
  momentum: 2,
  volatility: 1,
};
const candle = {
  date: "2024-01-02",
  open: 110,
  high: 125,
  low: 105,
  close: 120,
  volume: 10,
};
test("uses next open, applies entry and exit costs, and values open positions", () => {
  const opts = {
    fee: 0.01,
    slippage: 0.02,
    threshold: 0.65,
  };
  const buy = advance(
    initialPortfolio(1000),
    candle,
    input,
    {
      action: "buy",
      probability: 0.9,
      model: "test",
    },
    opts,
    112.2,
    1000,
  );
  assert.equal(buy.fillPrice, 112.2);
  assert.ok(Math.abs(buy.portfolio.units - 1000 / (112.2 * 1.01)) < 1e-12);
  assert.equal(buy.equity, buy.portfolio.units * 120);
  assert.equal(buy.portfolio.cash, 0);
  const sell = advance(
    buy.portfolio,
    {
      ...candle,
      date: "2024-01-03",
      open: 130,
    },
    input,
    {
      action: "sell",
      probability: 0.9,
      model: "test",
    },
    opts,
    112.2,
    1000,
  );
  assert.equal(sell.portfolio.units, 0);
  assert.ok(
    Math.abs(sell.equity - buy.portfolio.units * 130 * 0.98 * 0.99) < 1e-9,
  );
});
test("low confidence holds and first-day drawdown includes initial capital", () => {
  const p = advance(
    initialPortfolio(1000),
    candle,
    input,
    {
      action: "buy",
      probability: 0.5,
      model: "test",
    },
    {
      fee: 0,
      slippage: 0,
      threshold: 0.65,
    },
    110,
    1000,
  );
  assert.equal(p.executed, "hold");
  assert.equal(p.equity, 1000);
  const loss = advance(
    initialPortfolio(1000),
    {
      ...candle,
      close: 55,
    },
    input,
    {
      action: "buy",
      probability: 1,
      model: "test",
    },
    {
      fee: 0,
      slippage: 0,
      threshold: 0.65,
    },
    110,
    1000,
  );
  assert.ok(Math.abs(loss.drawdown + 50) < 1e-9);
});
test("executes only valid position transitions for all three actions", () => {
  const opts = { fee: 0, slippage: 0, threshold: 0.65 };
  const flat = initialPortfolio(1000);
  const held = advance(
    flat,
    candle,
    input,
    { action: "hold", probability: 0.9, model: "test" },
    opts,
    110,
    1000,
  );
  assert.equal(held.executed, "hold");
  assert.equal(held.portfolio.units, 0);

  const bought = advance(
    flat,
    candle,
    input,
    { action: "buy", probability: 0.9, model: "test" },
    opts,
    110,
    1000,
  );
  const repeatedBuy = advance(
    bought.portfolio,
    candle,
    input,
    { action: "buy", probability: 0.9, model: "test" },
    opts,
    110,
    1000,
  );
  assert.equal(repeatedBuy.executed, "hold");
  assert.equal(repeatedBuy.portfolio.units, bought.portfolio.units);

  const sold = advance(
    bought.portfolio,
    candle,
    input,
    { action: "sell", probability: 0.9, model: "test" },
    opts,
    110,
    1000,
  );
  assert.equal(sold.executed, "sell");
  assert.equal(sold.portfolio.units, 0);
});
test("warm-up gives exact requested dates and future changes do not affect prior inputs", () => {
  const c = demoCandles("2024-01-01", "2024-03-31");
  assert.equal(c.length - 21, 91);
  assert.equal(c[21].date, "2024-01-01");
  assert.equal(c.at(-1).date, "2024-03-31");
  const before = features(c.slice(0, 21));
  c[21].close = 999999;
  assert.deepEqual(features(c.slice(0, 21)), before);
});
