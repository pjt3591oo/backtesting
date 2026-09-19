import { jevServer } from "@/lib/jev-server";
import { closedMinutes, marketSignal } from "@/lib/live";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      {
        error: "허용되지 않은 요청입니다.",
      },
      {
        status: 403,
      },
    );
  try {
    const priceSignal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(15000),
    ]);
    const base = "https://data-api.binance.vision/api/v3";
    const [kr, pr] = await Promise.all([
      fetch(`${base}/klines?symbol=BTCUSDT&interval=1m&limit=61`, {
        signal: priceSignal,
        cache: "no-store",
      }),
      fetch(`${base}/ticker/price?symbol=BTCUSDT`, {
        signal: priceSignal,
        cache: "no-store",
      }),
    ]);
    if (!kr.ok || !pr.ok)
      throw Error(
        "Binance 시세를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    const observedAt = Date.now(),
      candles = closedMinutes(await kr.json(), observedAt);
    const ticker = (await pr.json()) as {
      price?: string;
    };
    const price = Number(ticker.price);
    if (!Number.isFinite(price) || price <= 0)
      throw Error("현재 가격이 올바르지 않습니다.");
    const avg = (n: number) =>
      candles.slice(-n).reduce((sum, c) => sum + c.close, 0) / n;
    const input = {
      sma5: avg(5),
      sma20: avg(20),
      momentum5m: (candles.at(-1)!.close / candles.at(-6)!.close - 1) * 100,
      lastClosedAt: candles.at(-1)!.closeTime,
    };
    const config = jevServer(request);
    const { baseUrl, model, headers, provider } = config;
    const payload = {
      ...(model
        ? {
            model,
          }
        : {}),
      state: JSON.stringify({
        market: "BTCUSDT",
        horizon: "next 5 to 15 minutes",
        observedAt: new Date(observedAt).toISOString(),
        currentPrice: price,
        indicatorsFromClosedOneMinuteCandles: input,
      }),
      questions: {
        action: {
          type: "choice",
          instructions:
            "Classify the current market signal as buy, sell, or wait using only this snapshot. Compare moving averages, momentum, and price. Buy for bullish, sell for bearish, wait for mixed.",
          criteria: {
            buy: "Bullish trend and positive momentum support a buy signal.",
            sell: "Bearish trend and adverse momentum support a sell signal.",
            wait: "Signals are mixed or uncertain; no clear directional action.",
          },
        },
      },
    };

    let choice: string | undefined;
    let probabilities: Record<string, number> | undefined;
    let responseModel: string | undefined;

    // Try Jev native /v1/systemone if provider is jev
    if (provider === "jev") {
      try {
        const r = await fetch(`${baseUrl}/v1/systemone`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(120000),
          ]),
        });
        if (r.ok) {
          const raw = (await r.json()) as {
            model?: string;
            answers?: {
              action?: {
                choice?: string;
                probabilities?: Record<string, number>;
              };
            };
          };
          const a = raw.answers?.action;
          if (a?.choice && a.probabilities) {
            choice = a.choice;
            probabilities = a.probabilities;
            responseModel = raw.model;
          }
        }
      } catch {
        // Fall back to chat completions
      }
    }

    // Fallback to Custom LLM chat completions
    if (!choice || !probabilities) {
      const chatPayload = {
        model: model || "custom-model",
        messages: [
          {
            role: "system",
            content:
              'Analyze the live Bitcoin indicator snapshot and classify signal as "buy", "sell", or "wait". Return JSON strictly: {"choice": "buy"|"sell"|"wait", "probabilities": {"buy": 0.7, "sell": 0.1, "wait": 0.2}}',
          },
          {
            role: "user",
            content: JSON.stringify({ price, input }),
          },
        ],
        response_format: { type: "json_object" },
      };

      const r = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(chatPayload),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)]),
      });

      if (!r.ok) {
        throw Error(
          `AI API 요청 실패 (${r.status}). API 주소와 Key, 모델 설정을 확인해 주세요.`,
        );
      }

      const raw = (await r.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = raw.choices?.[0]?.message?.content;
      const parsed = content ? JSON.parse(content) : null;
      choice = parsed?.choice || parsed?.action;
      probabilities = parsed?.probabilities || {
        buy: choice === "buy" ? 0.8 : 0.1,
        sell: choice === "sell" ? 0.8 : 0.1,
        wait: choice === "wait" ? 0.8 : 0.1,
      };
      responseModel = raw.model;
    }

    if (
      !choice ||
      !["buy", "sell", "wait"].includes(choice) ||
      !probabilities
    ) {
      throw Error("AI 모델 응답 형식이 올바르지 않습니다.");
    }

    const signal = marketSignal(choice, probabilities);
    if (Date.now() - observedAt > 90000)
      throw Error(
        "추론 중 시세가 오래되어 판단을 보류했습니다. 다시 갱신해 주세요.",
      );
    return Response.json(
      {
        observedAt,
        finishedAt: Date.now(),
        price,
        model: responseModel ?? model,
        signal,
        choice,
        probabilities,
        candles,
        input,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error && e.name !== "TimeoutError"
            ? e.message
            : "응답 시간이 초과되었습니다. 시세와 로컬 서버 연결을 확인해 주세요.",
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
