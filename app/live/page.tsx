"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, Play, Square, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { getApiHeaders } from "@/lib/api-config";
import { Progress } from "@/components/ui/progress";
import { CandleChart } from "@/components/candle-chart";
import type { LiveResult } from "@/lib/live";
const price = (n: number) =>
  n.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
const time = (n: number) =>
  new Date(n).toLocaleTimeString("en-GB", {
    hour12: false,
  });
export default function Live() {
  const [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [data, setData] = useState<LiveResult | null>(null),
    [history, setHistory] = useState<LiveResult[]>([]),
    [now, setNow] = useState(0);
  const abort = useRef<AbortController | null>(null),
    mounted = useRef(true);
  async function refresh() {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/live", {
        method: "POST",
        headers: getApiHeaders(),
        signal: controller.signal,
      });
      const result = (await r.json()) as LiveResult & {
        error?: string;
      };
      if (!r.ok) throw Error(result.error || "판단을 받지 못했습니다.");
      if (!controller.signal.aborted && mounted.current) {
        setData(result);
        setNow(Date.now());
        setHistory((h) => [result, ...h].slice(0, 50));
      }
    } catch (e) {
      if (!controller.signal.aborted && mounted.current)
        setError(e instanceof Error ? e.message : "연결에 실패했습니다.");
    } finally {
      if (abort.current === controller) abort.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(tick);
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function loop() {
      if (!document.hidden) await refresh();
      if (!disposed) timer = setTimeout(loop, 30000);
    }
    void loop();
    return () => {
      disposed = true;
      clearTimeout(timer);
      abort.current?.abort();
    };
  }, [active]);
  const labels: Record<string, string> = {
    buy: "매수",
    sell: "매도",
    wait: "관망",
  };
  const stale = !!data && now - data.observedAt > 90000,
    valid = !!data && !stale && !error;
  return (
    <div className="app-shell">
      <Header activeTab="live" />
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">LIVE MARKET · BTC / USDT</div>
            <h1>지금, 사고팔아도 될까?</h1>
            <p>완료된 1분봉과 현재가를 로컬 Jev가 평가합니다.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy || active}
              onClick={() => void refresh()}
            >
              <RefreshCw />
              지금 판단
            </Button>
            <Button onClick={() => setActive((v) => !v)}>
              {active ? <Square /> : <Play />}
              {active ? "자동 갱신 중지" : "30초 자동 갱신"}
            </Button>
          </div>
        </div>
        <div className="mode-notice">
          <Activity size={20} />
          <div>
            <strong>매수 · 매도 · 관망</strong>
            <span>향후 5~15분 관점 · 자동 주문 없음</span>
          </div>
        </div>
        {error && (
          <div role="alert" className="error mt-4">
            {error} 이전 판단은 현재 신호로 사용하지 않습니다.
          </div>
        )}
        <div className="live-grid">
          <section className="panel live-signal">
            <div className="section-title">
              <h2>로컬 Jev 판단</h2>
              <span role="status">
                {busy ? "분석 중" : active ? "자동 갱신 켜짐" : "수동 모드"}
              </span>
            </div>
            <div className={`live-verdict ${valid ? data.signal : "hold"}`}>
              {!data ? "판단 대기" : !valid ? "판단 보류" : labels[data.signal]}
            </div>
            <p className="live-explanation">
              {!data
                ? "지금 판단을 누르면 시세를 가져와 로컬 모델에 물어봅니다."
                : stale
                  ? "시세 수집 후 90초가 지났습니다. 최신 판단을 요청해 주세요."
                  : error
                    ? "연결을 복구한 뒤 새 판단을 확인해 주세요."
                    : `로컬 모델이 현재 추세와 모멘텀을 평가해 ${labels[data.signal]}을 선택했습니다.`}
            </p>
            {data && (
              <>
                {["buy", "sell", "wait"].map((action) => (
                  <div key={action} className="mt-4">
                    <div className="prob-label">
                      <span>{labels[action]} 선택 확률</span>
                      <strong>
                        {(data.probabilities[action] * 100).toFixed(1)}%
                      </strong>
                    </div>
                    <Progress value={data.probabilities[action] * 100} />
                  </div>
                ))}
                <p className="text-sm text-slate-500 mt-5 break-all">
                  모델 · {data.model}
                </p>
              </>
            )}
            <p className="live-footnote">
              선택 확률은 모델이 선택지에 부여한 값이며, 가격 상승 확률이나 수익
              보장을 뜻하지 않습니다.
            </p>
          </section>
          <section className="panel live-market">
            <div className="section-title">
              <h2>비트코인 시세</h2>
              <span>Binance · USDT</span>
            </div>
            <div className="live-price">
              {data ? price(data.price) : "—"}
              <span>USDT</span>
            </div>
            <p className="text-sm text-slate-500">
              {data
                ? `시세 수집 ${time(data.observedAt)} · ${Math.max(0, Math.floor((now - data.observedAt) / 1000))}초 전`
                : "시세를 아직 수집하지 않았습니다."}
            </p>
            <div className="live-chart">
              {data ? (
                <CandleChart
                  candles={data.candles.map((c) => ({
                    ...c,
                    label: time(c.time),
                  }))}
                  label="비트코인 1분봉 캔들 차트"
                />
              ) : (
                <div className="empty">
                  <Activity size={32} />
                  <p>최근 60개 완료된 1분봉이 표시됩니다.</p>
                </div>
              )}
            </div>
            <div className="live-indicators">
              <div>
                <span>5분 이동평균</span>
                <strong>{data ? price(data.input.sma5) : "—"}</strong>
              </div>
              <div>
                <span>20분 이동평균</span>
                <strong>{data ? price(data.input.sma20) : "—"}</strong>
              </div>
              <div>
                <span>5분 가격 변화</span>
                <strong>
                  {data ? `${data.input.momentum5m.toFixed(2)}%` : "—"}
                </strong>
              </div>
            </div>
            <p className="live-footnote">
              {data
                ? `지표 기준: ${time(data.input.lastClosedAt)} 마감 봉. `
                : ""}
              진행 중인 봉은 지표에서 제외합니다.
            </p>
          </section>
        </div>
        <section className="panel log-panel mt-5">
          <div className="section-title">
            <h2>이번 세션의 판단 기록</h2>
            <span>최근 50회</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>수집 시각</th>
                  <th>당시 가격</th>
                  <th>판단</th>
                  <th>모델 선택 / 확률</th>
                  <th>추론 시간</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.observedAt}>
                    <td>{time(r.observedAt)}</td>
                    <td>{price(r.price)}</td>
                    <td className={r.signal}>{labels[r.signal]}</td>
                    <td>
                      {labels[r.choice]} ·{" "}
                      {(r.probabilities[r.choice] * 100).toFixed(1)}%
                    </td>
                    <td>
                      {((r.finishedAt - r.observedAt) / 1000).toFixed(1)}초
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!history.length && (
              <p className="table-empty">첫 판단을 실행하면 기록이 쌓입니다.</p>
            )}
          </div>
        </section>
        <footer>
          <Link href="/" className="flex gap-2 items-center">
            <ArrowLeft size={14} />
            백테스트로 돌아가기
          </Link>
          <span>
            자동 갱신은 요청 완료 후 30초마다 진행되며, 탭이 숨겨지면 새 요청을
            쉽니다.
          </span>
        </footer>
      </main>
    </div>
  );
}
