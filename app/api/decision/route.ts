import { jevServer } from "@/lib/jev-server";
import { z } from "zod";
const inputSchema = z.object({
  input: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    close: z.number().positive().finite(),
    sma5: z.number().positive().finite(),
    sma20: z.number().positive().finite(),
    momentum: z.number().finite(),
    volatility: z.number().nonnegative().finite(),
  }),
  position: z.enum(["flat", "long"]).default("flat"),
});
type Action = "buy" | "sell" | "hold";
function normalizeAction(value: unknown): Action | undefined {
  if (typeof value !== "string") return undefined;
  const action = value.trim().toLowerCase();
  if (action === "buy") return "buy";
  if (action === "sell") return "sell";
  if (["hold", "wait", "stay", "none"].includes(action)) return "hold";
  return undefined;
}
function normalizeProbability(value: unknown): number | undefined {
  const probability = Number(value);
  return Number.isFinite(probability) && probability >= 0 && probability <= 1
    ? probability
    : undefined;
}
function applyPositionPolicy(
  action: Action,
  probability: number,
  input: z.infer<typeof inputSchema>["input"],
  position: "flat" | "long",
) {
  const bullish = input.sma5 > input.sma20 * 1.005 && input.momentum > 0;
  const bearish = input.sma5 < input.sma20 * 0.995 && input.momentum < 0;
  const expected =
    position === "flat" && bullish
      ? "buy"
      : position === "long" && bearish
        ? "sell"
        : "hold";
  if (expected === "hold") {
    return { action: "hold", probability };
  }
  if (action === expected) {
    return { action, probability };
  }
  return { action: expected as Action, probability: Math.max(probability, 0.75) };
}
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
  const config = jevServer(request);
  const { baseUrl, model, headers, provider } = config;
  let body;
  try {
    const text = await request.text();
    if (text.length > 5000) throw Error();
    body = inputSchema.parse(JSON.parse(text));
  } catch {
    return Response.json(
      {
        error: "입력 데이터가 올바르지 않습니다.",
      },
      {
        status: 400,
      },
    );
  }
  const payload = {
    ...(model
      ? {
          model,
        }
      : {}),
    state: JSON.stringify({
      market: "BTCUSDT spot long-only",
      position: body.position,
      ...body.input,
    }),
    questions: {
      action: {
        type: "choice",
        instructions:
          "Using only the supplied completed daily candle indicators, choose the current trend-following exposure action. Evaluate trend alignment, five-day momentum and volatility. Do not use knowledge of later market events. This is a historical simulation.",
        criteria: {
          buy: "Bullish trend alignment and positive momentum support holding Bitcoin.",
          sell: "Bearish trend alignment or adverse momentum support holding cash.",
          hold: "Signals are mixed; keep the current exposure unchanged.",
        },
      },
    },
  };

  // Try Jev native /v1/systemone endpoint if provider is jev
  if (provider === "jev") {
    try {
      const r = await fetch(`${baseUrl}/v1/systemone`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)]),
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
        const a = raw.answers?.action,
          choice =
            typeof a?.choice === "string" ? a.choice.trim().toLowerCase() : "",
          action = normalizeAction(choice),
          probability = action
            ? normalizeProbability(
                a?.probabilities?.[choice] ?? a?.probabilities?.[action],
              )
            : undefined;
        if (
          action &&
          ["buy", "sell", "hold"].includes(action) &&
          typeof probability === "number" &&
          Number.isFinite(probability) &&
          probability >= 0 &&
          probability <= 1
        ) {
          return Response.json(
            {
              ...applyPositionPolicy(action, probability, body.input, body.position),
              model: raw.model ?? model,
              raw: { request: payload, response: raw },
            },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
      }
    } catch {
      // Fall back to chat completions if systemone is unavailable
    }
  }

  // Custom AI API /v1/chat/completions fallback
  try {
    const chatPayload = {
      model: model || "custom-model",
      messages: [
        {
          role: "system",
          content:
            'You are a quantitative trading decision model evaluating Bitcoin indicators. Choose action ("buy", "sell", or "hold") and confidence probability (0.5-1.0). Return strictly JSON: {"action": "buy"|"sell"|"hold", "probability": 0.85}',
        },
        {
          role: "user",
          content: JSON.stringify({ ...body.input, position: body.position }),
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
      return Response.json(
        {
          error: `AI API 요청 실패 (${r.status}). API 주소와 Key, 모델 설정을 확인해 주세요.`,
        },
        { status: 502 },
      );
    }

    const raw = (await r.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = raw.choices?.[0]?.message?.content;
    const parsed = content ? JSON.parse(content) : null;
    const action = normalizeAction(parsed?.action ?? parsed?.choice);
    const probability = normalizeProbability(parsed?.probability ?? 0.75);

    if (!action || !["buy", "sell", "hold"].includes(action)) {
      throw new Error("API 응답에서 판단 결과를 읽을 수 없습니다.");
    }

    const guarded = applyPositionPolicy(
      action,
      probability ?? 0.75,
      body.input,
      body.position,
    );
    return Response.json(
      {
        ...guarded,
        model: raw.model || model || "ai-model",
        raw: { request: chatPayload, response: raw },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "AI API 응답을 받지 못했습니다. 서버 연결 상태와 API Key/엔드포인트 설정을 확인해 주세요.",
      },
      { status: 502 },
    );
  }
}
