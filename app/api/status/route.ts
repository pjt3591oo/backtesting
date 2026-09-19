import { jevServer } from "@/lib/jev-server";
export async function GET(request: Request) {
  const config = jevServer(request);
  const { baseUrl, headers, label, model } = config;

  try {
    let connected = false;
    let serverModel: string | null = model || null;

    // Try Jev /health endpoint first
    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers,
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const health = (await response.json()) as {
          ok?: boolean;
          model?: string;
        };
        connected =
          response.ok && (health.ok === true || health.ok === undefined);
        if (health.model) serverModel = health.model;
      }
    } catch {
      // If /health fails, try /v1/models endpoint
      try {
        const response = await fetch(`${baseUrl}/v1/models`, {
          headers,
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          connected = true;
        }
      } catch {
        connected = false;
      }
    }

    const displayLabel = connected
      ? serverModel
        ? `${label.includes("(") ? label.split(" (")[0] : label} (${serverModel}) 연결됨`
        : `${label} 연결됨`
      : `${label} 연결 대기`;

    return Response.json(
      {
        connected,
        model: serverModel,
        provider: config.provider,
        label: displayLabel,
        baseUrl,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      {
        connected: false,
        model: null,
        provider: config.provider,
        label: `${label} 연결 대기`,
        baseUrl,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
