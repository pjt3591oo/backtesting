export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type Features = {
  date: string;
  close: number;
  sma5: number;
  sma20: number;
  momentum: number;
  volatility: number;
};
export type Decision = {
  action: "buy" | "sell" | "hold";
  probability: number;
  model: string;
  raw?: unknown;
};
export type Portfolio = {
  cash: number;
  units: number;
  peak: number;
};
export type Point = Candle & {
  input: Features;
  decision: Decision;
  portfolio: Portfolio;
  executed: Decision["action"];
  reason: string;
  equity: number;
  benchmark: number;
  benchmarkEntry: number;
  drawdown: number;
  fillPrice: number;
  cost: number;
};
export function initialPortfolio(capital: number): Portfolio {
  return {
    cash: capital,
    units: 0,
    peak: capital,
  };
}
export function features(c: Candle[]): Features {
  const last = c.at(-1)!;
  const mean = (n: number) => c.slice(-n).reduce((s, b) => s + b.close, 0) / n;
  const r = c
    .slice(-20)
    .map((b, i, a) => (i ? Math.log(b.close / a[i - 1].close) : 0))
    .slice(1);
  const avg = r.reduce((a, b) => a + b, 0) / r.length;
  return {
    date: last.date,
    close: last.close,
    sma5: mean(5),
    sma20: mean(20),
    momentum: (last.close / c.at(-6)!.close - 1) * 100,
    volatility:
      Math.sqrt(r.reduce((s, x) => s + (x - avg) ** 2, 0) / r.length) * 100,
  };
}
export function ruleDecision(f: Features): Decision {
  return {
    action:
      f.sma5 > f.sma20 * 1.005
        ? "buy"
        : f.sma5 < f.sma20 * 0.995
          ? "sell"
          : "hold",
    probability: 0.75,
    model: "sma-5-20-rule-v1",
  };
}
export function advance(
  p: Portfolio,
  c: Candle,
  input: Features,
  d: Decision,
  opts: {
    fee: number;
    slippage: number;
    threshold: number;
  },
  benchmarkEntry: number,
  capital: number,
): Point {
  let { cash, units, peak } = p;
  let executed: Decision["action"] = "hold",
    cost = 0,
    fillPrice = 0;
  let reason = d.model.startsWith("sma")
    ? "5일·20일 이동평균 비교 규칙을 적용했습니다."
    : "Jev가 선택한 행동과 선택 확률에 매매 규칙을 적용했습니다.";
  if (d.probability < opts.threshold)
    reason = "선택 확률이 최소 기준보다 낮아 관망했습니다.";
  else if (d.action === "buy" && units === 0) {
    fillPrice = c.open * (1 + opts.slippage);
    units = cash / (fillPrice * (1 + opts.fee));
    cost = units * fillPrice * opts.fee;
    cash = 0;
    executed = "buy";
  } else if (d.action === "sell" && units > 0) {
    fillPrice = c.open * (1 - opts.slippage);
    cost = units * fillPrice * opts.fee;
    cash = units * fillPrice - cost;
    units = 0;
    executed = "sell";
  } else
    reason +=
      d.action === "buy"
        ? " 이미 보유 중이므로 추가 매수하지 않았습니다."
        : d.action === "sell"
          ? " 보유 수량이 없어 매도하지 않았습니다."
          : " 관망 조건입니다.";
  const equity = cash + units * c.close;
  peak = Math.max(peak, equity);
  return {
    ...c,
    input,
    decision: d,
    portfolio: {
      cash,
      units,
      peak,
    },
    executed,
    reason,
    equity,
    benchmark: (capital / (benchmarkEntry * (1 + opts.fee))) * c.close,
    benchmarkEntry,
    drawdown: (equity / peak - 1) * 100,
    fillPrice,
    cost,
  };
}
export function demoCandles(start: string, end: string): Candle[] {
  const out: Candle[] = [];
  const first = Date.parse(start) - 21 * 86400000,
    last = Date.parse(end);
  let prev = 42000;
  for (let t = first, i = 0; t <= last; t += 86400000, i++) {
    const close =
      42000 + i * 32 + Math.sin(i / 8) * 3400 + Math.sin(i * 1.71) * 430;
    out.push({
      date: new Date(t).toISOString().slice(0, 10),
      open: prev,
      high: Math.max(prev, close) * 1.007,
      low: Math.min(prev, close) * 0.993,
      close,
      volume: 10000 + Math.abs(Math.sin(i)) * 4000,
    });
    prev = close;
  }
  return out;
}
