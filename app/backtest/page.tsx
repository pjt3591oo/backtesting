"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bitcoin,
  Play,
  Square,
  Download,
  ArrowUpRight,
  FlaskConical,
  SlidersHorizontal,
  Activity,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { getApiHeaders } from "@/lib/api-config";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  demoCandles,
  features,
  advance,
  initialPortfolio,
  ruleDecision,
  type Candle,
  type Decision,
  type Point,
} from "@/lib/backtest";
import { CandleChart } from "@/components/candle-chart";
const money = (v: number) =>
  v.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const names = {
  buy: "매수",
  sell: "매도",
  hold: "관망",
};
export default function Home() {
  const [mode, setMode] = useState("jev"),
    [start, setStart] = useState("2024-01-01"),
    [end, setEnd] = useState("2024-03-31");
  const [capital, setCapital] = useState("10000"),
    [fee, setFee] = useState("0.1"),
    [slip, setSlip] = useState("0.05"),
    [threshold, setThreshold] = useState("0.5");
  const [rows, setRows] = useState<Point[]>([]),
    [running, setRunning] = useState(false),
    [status, setStatus] = useState("실행 준비"),
    [error, setError] = useState("");
  const [selected, setSelected] = useState(0),
    [total, setTotal] = useState(0),
    [connected, setConnected] = useState(false),
    [serverModel, setServerModel] = useState(""),
    [runMode, setRunMode] = useState("demo"),
    [runCapital, setRunCapital] = useState(10000),
    [config, setConfig] = useState<object>({});
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const r = await fetch("/api/status");
        const d = (await r.json()) as {
          connected: boolean;
          model?: string;
        };
        if (active) {
          setConnected(d.connected);
          setServerModel(d.model ?? "");
        }
      } catch {
        if (active) setConnected(false);
      }
    };
    void check();
    const timer = setInterval(check, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      abort.current?.abort();
    };
  }, []);
  const latest = rows.at(-1),
    focus = rows[selected] ?? latest,
    returnPct = latest ? (latest.equity / runCapital - 1) * 100 : 0;
  const trades = rows.filter((r) => r.executed !== "hold"),
    drawdown = rows.length ? Math.min(...rows.map((r) => r.drawdown)) : 0;
  async function run() {
    const c = Number(capital),
      f = Number(fee) / 100,
      s = Number(slip) / 100,
      t = Number(threshold);
    if (
      !Number.isFinite(c) ||
      c <= 0 ||
      !Number.isFinite(f) ||
      f < 0 ||
      f > 0.05 ||
      !Number.isFinite(s) ||
      s < 0 ||
      s > 0.05 ||
      !Number.isFinite(t) ||
      t < 0.5 ||
      t > 1
    ) {
      setError("초기 자금과 비용, 판단 기준을 확인해 주세요.");
      return;
    }
    const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
    if (
      !Number.isFinite(days) ||
      days < 2 ||
      days > 366 ||
      Date.parse(end) + 86400000 > Date.now() ||
      Date.parse(start) < Date.parse("2018-01-01")
    ) {
      setError("2018년 이후 완료된 날짜에서 2~366일을 선택해 주세요.");
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError("");
    setRows([]);
    setSelected(0);
    setTotal(0);
    setRunMode(mode);
    setRunCapital(c);
    setConfig({
      start,
      end,
      capital: c,
      fee: f,
      slippage: s,
      threshold: t,
      interval: "1d",
      mode,
    });
    try {
      setStatus("캔들 데이터 준비 중");
      let data: Candle[];
      if (mode === "demo") data = demoCandles(start, end);
      else {
        const r = await fetch(`/api/candles?start=${start}&end=${end}`, {
          signal: controller.signal,
        });
        const body = (await r.json()) as {
          error?: string;
          candles: Candle[];
        };
        if (!r.ok) throw Error(body.error);
        data = body.candles;
      }
      setTotal(data.length - 21);
      let portfolio = initialPortfolio(c);
      const result: Point[] = [];
      for (let i = 20; i < data.length - 1; i++) {
        if (controller.signal.aborted)
          throw new DOMException("Stopped", "AbortError");
        const input = features(data.slice(0, i + 1));
        let decision: Decision;
        setStatus(
          `${mode === "jev" ? "Jev 판단" : "규칙 분석"} 중 · ${data[i].date}`,
        );
        if (mode === "jev") {
          console.log("Jev 판단 요청", input);
          const r = await fetch("/api/decision", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getApiHeaders(),
            },
            body: JSON.stringify({
              input,
              position: portfolio.units > 0 ? "long" : "flat",
            }),
            signal: controller.signal,
          });
          const body = (await r.json()) as Decision & {
            error?: string;
          };
          if (!r.ok) throw Error(body.error);
          decision = body;
        } else decision = ruleDecision(input);
        const point = advance(
          portfolio,
          data[i + 1],
          input,
          decision,
          {
            fee: f,
            slippage: s,
            threshold: t,
          },
          result.length ? result[0].benchmarkEntry : data[i + 1].open * (1 + s),
          c,
        );
        portfolio = point.portfolio;
        result.push(point);
        setRows([...result]);
        setSelected(result.length - 1);
        if (mode !== "jev")
          await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      setStatus("백테스트 완료");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError")
        setStatus("실행 중단 · 부분 결과");
      else {
        setError(e instanceof Error ? e.message : "실행에 실패했습니다.");
        setStatus("실행 실패 · 부분 결과");
      }
    } finally {
      setRunning(false);
      abort.current = null;
    }
  }
  function download() {
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              config,
              status,
              source: runMode === "demo" ? "synthetic" : "Binance BTCUSDT",
              rows,
            },
            null,
            2,
          ),
        ],
        {
          type: "application/json",
        },
      ),
    );
    a.href = url;
    a.download = "bitcoin-backtest.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="app-shell">
      <Header activeTab="backtest" connected={connected} />
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">BITCOIN RESEARCH</div>
            <h1>
              비트코인 백테스트 <span className="version">01</span>
            </h1>
            <p>시장을 되돌려 보고, 판단의 순간을 살펴보세요.</p>
          </div>
          <Button
            variant="outline"
            onClick={download}
            disabled={!rows.length || running}
          >
            <Download />
            결과 다운로드
          </Button>
        </div>
        <div className="workspace">
          <aside className="settings panel">
            <div className="section-title">
              <SlidersHorizontal size={17} />
              <h2>실험 설정</h2>
            </div>
            <fieldset disabled={running}>
              <label>마켓</label>
              <div className="market">
                <span className="coin">
                  <Bitcoin />
                </span>
                <div>
                  <strong>Bitcoin</strong>
                  <small>BTC / USDT · 현물</small>
                </div>
                <span className="market-tag">롱 전용</span>
              </div>
              <label htmlFor="mode">실행 방식</label>
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="demo">예제 체험 · 합성 시세 + 규칙</option>
                <option value="rules">실제 시세 · 이동평균 규칙</option>
                <option value="jev" disabled={!connected}>
                  실제 시세 · AI 판단 모델 {connected ? "" : "(연결 필요)"}
                </option>
              </select>
              <label htmlFor="start">
                시작일 <span>UTC · 일봉</span>
              </label>
              <Input
                id="start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <label htmlFor="end">종료일</label>
              <Input
                id="end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
              <label htmlFor="capital">
                초기 자금 <span>USDT</span>
              </label>
              <Input
                id="capital"
                type="number"
                min="1"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
              />
              <div className="two-fields">
                <div>
                  <label htmlFor="fee">수수료 (%)</label>
                  <Input
                    id="fee"
                    type="number"
                    min="0"
                    max="5"
                    step="0.01"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="slip">슬리피지 (%)</label>
                  <Input
                    id="slip"
                    type="number"
                    min="0"
                    max="5"
                    step="0.01"
                    value={slip}
                    onChange={(e) => setSlip(e.target.value)}
                  />
                </div>
              </div>
              <label htmlFor="threshold">최소 선택 확률</label>
              <Input
                id="threshold"
                type="number"
                min="0.5"
                max="1"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </fieldset>
            <div className="strategy-note">
              <FlaskConical size={17} />
              <p>
                종가로 판단하고 다음 날 시가에 체결합니다. 매수 시 가용 자금을
                전액 사용합니다.
              </p>
            </div>
            <Button
              className="run-button"
              disabled={!running && mode === "jev" && !connected}
              onClick={running ? () => abort.current?.abort() : run}
            >
              {running ? <Square size={16} /> : <Play size={16} />}{" "}
              {running ? "실행 중단" : "백테스트 실행"}
            </Button>
            <p className="settings-foot">
              {mode === "jev"
                ? "판단마다 로컬 서버에서 추론합니다."
                : mode === "demo"
                  ? "예제 결과는 실제 비트코인 성과가 아닙니다."
                  : "Binance 과거 일봉으로 규칙을 검증합니다."}
            </p>
          </aside>
          <section className="results">
            {mode === "jev" && (
              <p className="text-sm text-slate-500" role="status">
                {connected
                  ? `로컬 모델 · ${serverModel}`
                  : "로컬 Jev 서버 연결을 확인하고 있습니다. 서버가 실행 중이면 자동으로 연결됩니다."}
              </p>
            )}
            <div className="mode-notice">
              <FlaskConical size={20} />
              <div>
                <strong>
                  {(rows.length ? runMode : mode) === "demo"
                    ? "예제 실험실"
                    : (rows.length ? runMode : mode) === "jev"
                      ? "Jev 판단 실험"
                      : "이동평균 전략 실험"}
                </strong>
                <span>
                  {(rows.length ? runMode : mode) === "demo"
                    ? "합성 시세와 이동평균 규칙으로 전체 흐름을 체험하세요."
                    : "미래 봉을 제외한 데이터로 판단하고, 마지막 보유분은 종가로 평가합니다."}
                </span>
              </div>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <div className="metrics">
              <Metric
                label="누적 수익률"
                value={latest ? pct(returnPct) : "—"}
                detail="거래 비용 반영"
                positive={returnPct >= 0}
              />
              <Metric
                label="최종 평가 자산"
                value={latest ? money(latest.equity) : "—"}
                detail="USDT · 미실현 손익 포함"
              />
              <Metric
                label="최대 낙폭"
                value={latest ? `${drawdown.toFixed(2)}%` : "—"}
                detail="일별 종가 자산 기준"
              />
              <Metric
                label="체결 횟수"
                value={latest ? String(trades.length) : "—"}
                detail="매수 + 매도"
              />
            </div>
            <section className="panel chart-panel">
              <div className="chart-heading">
                <div>
                  <h2>자산의 흐름</h2>
                  <p>전략과 단순 보유의 성과를 함께 확인하세요.</p>
                </div>
                <div className="legend">
                  <span>
                    <i />
                    전략
                  </span>
                  <span>
                    <i className="muted-line" />
                    단순 보유
                  </span>
                </div>
              </div>
              <div className="equity-chart">
                {rows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={rows}
                      margin={{
                        top: 15,
                        right: 10,
                        bottom: 5,
                        left: 8,
                      }}
                    >
                      <defs>
                        <linearGradient
                          id="equity-fill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#ec7828"
                            stopOpacity={0.22}
                          />
                          <stop
                            offset="100%"
                            stopColor="#ec7828"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#e9edf1" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(s) => s.slice(5)}
                        minTickGap={60}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                        axisLine={false}
                        tickLine={false}
                        width={48}
                      />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Area
                        type="linear"
                        name="단순 보유"
                        dataKey="benchmark"
                        stroke="#a4b0bd"
                        strokeDasharray="5 5"
                        fill="none"
                        isAnimationActive={false}
                      />
                      <Area
                        type="linear"
                        name="전략"
                        dataKey="equity"
                        stroke="#e6782d"
                        fill="url(#equity-fill)"
                        strokeWidth={2.5}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty">
                    <Activity size={34} />
                    <h3>첫 번째 실험을 시작하세요</h3>
                    <p>
                      왼쪽에서 조건을 설정하고 실행하면
                      <br />
                      자산 변화와 판단 과정이 이곳에 표시됩니다.
                    </p>
                  </div>
                )}
              </div>
              <div className="run-progress">
                <div>
                  <span className={running ? "pulse" : ""} />
                  <strong role="status">{status}</strong>
                  <small>
                    {rows.length} / {total || "—"}일
                  </small>
                </div>
                <Progress value={total ? (rows.length / total) * 100 : 0} />
              </div>
            </section>
            <div className="detail-grid">
              <section className="panel price-panel">
                <div className="section-title">
                  <h2>가격과 체결</h2>
                  <span>BTC / USDT</span>
                </div>
                <div className="price-chart">
                  {rows.length ? (
                    <CandleChart
                      candles={rows.map((r) => ({
                        ...r,
                        label: r.date,
                        marker: r.executed,
                      }))}
                      label="백테스트 일봉 캔들 차트"
                      onSelect={running ? undefined : setSelected}
                    />
                  ) : (
                    <div className="small-empty">
                      실행 후 가격과 매매 시점이 표시됩니다.
                    </div>
                  )}
                </div>
                <div className="timeline">
                  <label htmlFor="timeline">
                    판단 시점 탐색 <span>{focus?.input.date ?? "—"}</span>
                  </label>
                  <input
                    id="timeline"
                    aria-label="판단 시점 선택"
                    type="range"
                    min="0"
                    max={Math.max(0, rows.length - 1)}
                    value={selected}
                    disabled={!rows.length || running}
                    onChange={(e) => setSelected(+e.target.value)}
                  />
                  <p>양봉: 초록 · 음봉: 빨강 · ▲ 매수 / ▼ 매도 체결일</p>
                </div>
              </section>
              <section className="panel decision-panel">
                <div className="section-title">
                  <h2>
                    {(rows.length ? runMode : mode) === "jev"
                      ? "로컬 Jev"
                      : "규칙"}{" "}
                    판단 내역
                  </h2>
                  <span className="tag">
                    {(rows.length ? runMode : mode) === "jev" ? "AI" : "RULE"}
                  </span>
                </div>
                {focus ? (
                  <>
                    <div className="decision-action">
                      <strong className={focus.executed}>
                        {names[focus.executed]}
                      </strong>
                      <span>{focus.date} 체결 기준</span>
                    </div>
                    <p className="decision-reason">{focus.reason}</p>
                    <div className="prob-label">
                      <span>
                        {runMode === "jev" ? "선택 확률" : "규칙 점수 (고정값)"}
                      </span>
                      <strong>
                        {(focus.decision.probability * 100).toFixed(1)}%
                      </strong>
                    </div>
                    <Progress value={focus.decision.probability * 100} />
                    <dl>
                      <div>
                        <dt>판단일 종가</dt>
                        <dd>{money(focus.input.close)}</dd>
                      </div>
                      <div>
                        <dt>5일 이동평균</dt>
                        <dd>{money(focus.input.sma5)}</dd>
                      </div>
                      <div>
                        <dt>20일 이동평균</dt>
                        <dd>{money(focus.input.sma20)}</dd>
                      </div>
                      <div>
                        <dt>5일 가격 변화</dt>
                        <dd>{pct(focus.input.momentum)}</dd>
                      </div>
                      <div>
                        <dt>보유 BTC</dt>
                        <dd>{focus.portfolio.units.toFixed(6)}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <div className="small-empty">
                    시점별 입력 데이터와
                    <br />
                    거래 조건을 확인할 수 있습니다.
                  </div>
                )}
              </section>
            </div>
            <section className="panel log-panel">
              <Tabs defaultValue="trades">
                <TabsList variant="line">
                  <TabsTrigger value="trades">
                    거래 내역 <span className="count">{trades.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="method">실험 방법</TabsTrigger>
                </TabsList>
                <TabsContent value="trades">
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>체결일 (UTC)</th>
                          <th>유형</th>
                          <th>체결 가격</th>
                          <th>수수료</th>
                          <th>평가 자산</th>
                          <th>판단</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((p) => (
                          <tr key={p.date}>
                            <td>{p.date}</td>
                            <td>
                              <span className={`trade-pill ${p.executed}`}>
                                {names[p.executed]}
                              </span>
                            </td>
                            <td>{money(p.fillPrice)}</td>
                            <td>{money(p.cost)}</td>
                            <td>{money(p.equity)}</td>
                            <td>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`${p.date} 판단 보기`}
                                onClick={() => setSelected(rows.indexOf(p))}
                              >
                                <ChevronRight size={16} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!trades.length && (
                      <p className="table-empty">
                        아직 체결된 거래가 없습니다.
                      </p>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="method">
                  <div className="method">
                    <p>
                      완료된 봉의 종가, 5일·20일 이동평균, 5일 가격 변화와 20일
                      변동성으로 판단합니다. 시작일 전 21일은 준비 기간입니다.
                    </p>
                    <p>
                      선택 확률이 기준 이상이면 매수·매도합니다. 보유 중 매수와
                      미보유 중 매도는 관망 처리합니다. 규칙 모드 점수는 모델
                      확률이 아닌 고정값입니다.
                    </p>
                    <p>
                      다음 봉 시가에 슬리피지와 수수료를 적용합니다. 종료일에
                      강제 청산하지 않으며, 단순 보유에도 동일한 진입 비용을
                      적용합니다.
                    </p>
                    <p>
                      Jev의 학습 데이터에 과거 시장 정보가 포함됐는지는 확인할
                      수 없습니다. 과거 실험은 독립적인 미래 예측 성능을
                      입증하지 않습니다.
                    </p>
                    <p>
                      실험은 현재 화면에만 유지됩니다. 입력, 응답, 설정은 결과
                      다운로드로 보관하세요.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </section>
          </section>
        </div>
        <footer>
          <span>Jev / Lab</span>
          <span>비트코인 전략을 이해하는 작은 실험실</span>
          <a
            href="https://docs.typesafe.ai/introduction"
            target="_blank"
            rel="noreferrer"
          >
            TypeSafe 문서 <ArrowUpRight size={14} />
          </a>
        </footer>
      </main>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  positive = false,
}: {
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
}) {
  return (
    <div className="metric">
      <label>{label}</label>
      <strong className={positive ? "positive" : ""}>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
