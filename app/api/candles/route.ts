export async function GET(request: Request) {
  const q = new URL(request.url).searchParams,
    start = q.get("start") ?? "",
    end = q.get("end") ?? "";
  const from = Date.parse(start),
    to = Date.parse(end),
    day = 86400000;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < Date.parse("2018-01-01") ||
    to - from < day ||
    to - from > 365 * day ||
    to + day > Date.now()
  )
    return Response.json(
      {
        error: "완료된 날짜에서 2~366일을 선택해 주세요.",
      },
      {
        status: 400,
      },
    );
  try {
    const url = new URL("https://data-api.binance.vision/api/v3/klines");
    url.search = new URLSearchParams({
      symbol: "BTCUSDT",
      interval: "1d",
      startTime: String(from - 21 * day),
      endTime: String(to + day - 1),
      limit: "1000",
    }).toString();
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw Error(
        `시세 제공자가 요청을 처리하지 못했습니다 (${response.status}). 잠시 후 다시 시도해 주세요.`,
      );
    const raw = (await response.json()) as unknown;
    if (!Array.isArray(raw)) throw Error("시세 응답 형식이 올바르지 않습니다.");
    const candles = raw.map((r: unknown[]) => ({
      date: new Date(Number(r[0])).toISOString().slice(0, 10),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }));
    const expected = (to - from) / day + 22;
    if (
      candles.length !== expected ||
      candles.some(
        (c, i) =>
          ![c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) ||
          c.low <= 0 ||
          Date.parse(c.date) !== from + (i - 21) * day,
      )
    )
      throw Error("선택 기간의 시세가 누락되어 실행을 중단했습니다.");
    return Response.json({
      candles,
      source: "Binance BTCUSDT",
      interval: "1d",
    });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "시세를 불러오지 못했습니다.",
      },
      {
        status: 502,
      },
    );
  }
}
