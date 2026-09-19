import { useEffect, useRef, useState } from "react";
import { getApiHeaders } from "@/lib/api-config";
import {
  advance,
  demoCandles,
  features,
  initialPortfolio,
  ruleDecision,
  type Candle,
  type Decision,
  type Features,
  type Point,
} from "@/lib/backtest";

export type BacktestMode = "demo" | "rules" | "jev";
export type BacktestInputs = {
  mode: BacktestMode;
  start: string;
  end: string;
  capital: string;
  fee: string;
  slippage: string;
  threshold: string;
};

type BacktestConfig = {
  start: string;
  end: string;
  capital: number;
  fee: number;
  slippage: number;
  threshold: number;
  interval: "1d";
  mode: BacktestMode;
};

function parseInputs(inputs: BacktestInputs) {
  const capital = Number(inputs.capital);
  const fee = Number(inputs.fee) / 100;
  const slippage = Number(inputs.slippage) / 100;
  const threshold = Number(inputs.threshold);
  if (
    !Number.isFinite(capital) ||
    capital <= 0 ||
    !Number.isFinite(fee) ||
    fee < 0 ||
    fee > 0.05 ||
    !Number.isFinite(slippage) ||
    slippage < 0 ||
    slippage > 0.05 ||
    !Number.isFinite(threshold) ||
    threshold < 0.5 ||
    threshold > 1
  ) {
    throw Error("초기 자금과 비용, 판단 기준을 확인해 주세요.");
  }
  const startTime = Date.parse(inputs.start);
  const endTime = Date.parse(inputs.end);
  const days = (endTime - startTime) / 86400000 + 1;
  if (
    !Number.isFinite(days) ||
    days < 2 ||
    days > 366 ||
    endTime + 86400000 > Date.now() ||
    startTime < Date.parse("2018-01-01")
  ) {
    throw Error("2018년 이후 완료된 날짜에서 2~366일을 선택해 주세요.");
  }
  return { capital, fee, slippage, threshold };
}

export function useBacktest(connected: boolean) {
  const [rows, setRows] = useState<Point[]>([]);
  const [selected, setSelected] = useState(0);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("실행 준비");
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [runMode, setRunMode] = useState<BacktestMode>("demo");
  const [runCapital, setRunCapital] = useState(10000);
  const [config, setConfig] = useState<BacktestConfig | object>({});
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  async function run(inputs: BacktestInputs) {
    let parsed: ReturnType<typeof parseInputs>;
    try {
      parsed = parseInputs(inputs);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "입력값을 확인해 주세요.");
      return;
    }
    if (inputs.mode === "jev" && !connected) {
      setError("로컬 Jev 서버 연결을 확인해 주세요.");
      return;
    }

    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError("");
    setRows([]);
    setSelected(0);
    setTotal(0);
    setRunMode(inputs.mode);
    setRunCapital(parsed.capital);
    setConfig({
      start: inputs.start,
      end: inputs.end,
      capital: parsed.capital,
      fee: parsed.fee,
      slippage: parsed.slippage,
      threshold: parsed.threshold,
      interval: "1d",
      mode: inputs.mode,
    });

    try {
      setStatus("캔들 데이터 준비 중");
      const data = await loadCandles(inputs, controller.signal);
      const total = data.length - 21;
      setTotal(total);
      let portfolio = initialPortfolio(parsed.capital);
      const result: Point[] = [];
      for (let index = 20; index < data.length - 1; index += 1) {
        if (controller.signal.aborted) {
          throw new DOMException("Stopped", "AbortError");
        }
        const input = features(data.slice(0, index + 1));
        setStatus(
          `${inputs.mode === "jev" ? "Jev 판단" : "규칙 분석"} 중 · ${data[index].date}`,
        );
        const decision =
          inputs.mode === "jev"
            ? await requestDecision(input, portfolio.units > 0 ? "long" : "flat", controller.signal)
            : ruleDecision(input);
        const point = advance(
          portfolio,
          data[index + 1],
          input,
          decision,
          parsed,
          result.length ? result[0].benchmarkEntry : data[index + 1].open * (1 + parsed.slippage),
          parsed.capital,
        );
        portfolio = point.portfolio;
        result.push(point);
        setRows([...result]);
        setSelected(result.length - 1);
        if (inputs.mode !== "jev") {
          await new Promise<void>((resolve) => setTimeout(resolve, 25));
        }
      }
      setStatus("백테스트 완료");
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        setStatus("실행 중단 · 부분 결과");
      } else {
        setError(cause instanceof Error ? cause.message : "실행에 실패했습니다.");
        setStatus("실행 실패 · 부분 결과");
      }
    } finally {
      setRunning(false);
      abort.current = null;
    }
  }

  function stop() {
    abort.current?.abort();
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ config, status, source: runMode === "demo" ? "synthetic" : "Binance BTCUSDT", rows }, null, 2)],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bitcoin-backtest.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return {
    rows,
    selected,
    setSelected,
    total,
    running,
    status,
    error,
    runMode,
    runCapital,
    config,
    run,
    stop,
    download,
  };
}

async function loadCandles(inputs: BacktestInputs, signal: AbortSignal): Promise<Candle[]> {
  if (inputs.mode === "demo") return demoCandles(inputs.start, inputs.end);
  const response = await fetch(`/api/candles?start=${inputs.start}&end=${inputs.end}`, { signal });
  const body = (await response.json()) as { error?: string; candles: Candle[] };
  if (!response.ok) throw Error(body.error);
  return body.candles;
}

async function requestDecision(
  input: Features,
  position: "flat" | "long",
  signal: AbortSignal,
): Promise<Decision> {
  const response = await fetch("/api/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getApiHeaders() },
    body: JSON.stringify({ input, position }),
    signal,
  });
  const body = (await response.json()) as Decision & { error?: string };
  if (!response.ok) throw Error(body.error);
  return body;
}
