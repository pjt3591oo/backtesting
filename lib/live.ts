export type LiveCandle = {
  time: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
};
export function closedMinutes(raw: unknown, now: number): LiveCandle[] {
  if (!Array.isArray(raw)) throw Error("분봉 응답 형식이 올바르지 않습니다.");
  const candles = raw
    .map((r: unknown) => {
      if (!Array.isArray(r)) throw Error("분봉 데이터가 올바르지 않습니다.");
      const c = {
        time: Number(r[0]),
        closeTime: Number(r[6]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
      };
      if (
        !Object.values(c).every(Number.isFinite) ||
        c.low <= 0 ||
        c.low > Math.min(c.open, c.close) ||
        c.high < Math.max(c.open, c.close) ||
        c.closeTime !== c.time + 59999
      )
        throw Error("분봉 데이터가 올바르지 않습니다.");
      return c;
    })
    .filter((c) => c.closeTime < now)
    .slice(-60);
  if (
    candles.length < 21 ||
    now - candles.at(-1)!.closeTime > 120000 ||
    candles.some((c, i) => i > 0 && c.time - candles[i - 1].time !== 60000)
  )
    throw Error(
      "시세가 오래되었거나 분봉이 누락되었습니다. 판단을 보류합니다.",
    );
  return candles;
}
export function marketSignal(
  choice: string,
  probabilities: Record<string, number>,
) {
  const actions = ["buy", "sell", "wait"];
  if (
    !actions.includes(choice) ||
    !actions.every(
      (a) =>
        Number.isFinite(probabilities[a]) &&
        probabilities[a] >= 0 &&
        probabilities[a] <= 1,
    ) ||
    Math.abs(actions.reduce((s, a) => s + probabilities[a], 0) - 1) > 0.01
  )
    throw Error("모델의 선택 확률이 올바르지 않습니다.");
  return choice;
}
export type LiveResult = {
  observedAt: number;
  finishedAt: number;
  price: number;
  model: string;
  signal: string;
  choice: string;
  probabilities: Record<string, number>;
  candles: LiveCandle[];
  input: {
    sma5: number;
    sma20: number;
    momentum5m: number;
    lastClosedAt: number;
  };
};
