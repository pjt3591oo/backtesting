"use client";

import { useEffect, useRef, useState } from "react";
type Candle = {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  marker?: string;
};
export function CandleChart({
  candles,
  label,
  onSelect,
}: {
  candles: Candle[];
  label: string;
  onSelect?: (index: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: 600,
    height: 240,
  });
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  if (!candles.length) return <div>캔들 데이터가 없습니다.</div>;
  const width = Math.max(200, size.width),
    height = Math.max(120, size.height - 38),
    left = 64,
    right = 10,
    top = 14,
    bottom = 24;
  const chartWidth = width - left - right,
    chartHeight = height - top - bottom;
  const min = Math.min(...candles.map((c) => c.low)),
    max = Math.max(...candles.map((c) => c.high));
  const pad = Math.max((max - min) * 0.12, max * 0.0001);
  const lower = min - pad,
    upper = max + pad;
  const y = (price: number) =>
    top + ((upper - price) / (upper - lower)) * chartHeight;
  const step = chartWidth / candles.length,
    x = (i: number) => left + step * (i + 0.5);
  const index = Math.min(hover ?? candles.length - 1, candles.length - 1),
    current = candles[index];
  const format = (n: number) =>
    n.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
  function select(i: number) {
    setHover(i);
    onSelect?.(i);
  }
  return (
    <div
      ref={host}
      style={{
        height: "100%",
        width: "100%",
        minWidth: 0,
      }}
      role="region"
      aria-label={label}
    >
      <div
        style={{
          fontSize: 12,
          height: 38,
          lineHeight: "18px",
          color: "#64748b",
          overflow: "hidden",
        }}
      >
        <strong>{current.label}</strong> · 시 {format(current.open)} · 고{" "}
        {format(current.high)} · 저 {format(current.low)} · 종{" "}
        {format(current.close)}
      </div>
      <svg
        role="img"
        aria-label={`${label}. ${current.label} 시가 ${current.open}, 고가 ${current.high}, 저가 ${current.low}, 종가 ${current.close}. 좌우 방향키로 탐색.`}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            select(
              Math.max(
                0,
                Math.min(
                  candles.length - 1,
                  index + (e.key === "ArrowLeft" ? -1 : 1),
                ),
              ),
            );
          }
        }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = Math.floor(
            (((e.clientX - rect.left) * width) / rect.width - left) / step,
          );
          if (i >= 0 && i < candles.length) setHover(i);
        }}
        onClick={() => select(index)}
        style={{
          display: "block",
          touchAction: "pan-y",
        }}
      >
        {[0, 1, 2, 3].map((i) => {
          const price = lower + ((upper - lower) * i) / 3;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={width - right}
                y1={y(price)}
                y2={y(price)}
                stroke="#e9edf1"
              />
              <text
                x={left - 7}
                y={y(price) + 4}
                textAnchor="end"
                fontSize="11"
                fill="#8492a0"
              >
                {format(price)}
              </text>
            </g>
          );
        })}
        {candles.map((c, i) => {
          const color = c.close >= c.open ? "#099974" : "#dc6060";
          const body = Math.max(1, Math.min(14, step * 0.65));
          return (
            <g key={c.label}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke={color}
              />
              <rect
                x={x(i) - body / 2}
                y={Math.min(y(c.open), y(c.close))}
                width={body}
                height={Math.max(1, Math.abs(y(c.close) - y(c.open)))}
                fill={color}
              />
              {c.marker === "buy" && (
                <path d={`M${x(i)} ${y(c.low) + 4}l-4 7h8z`} fill="#087a5f" />
              )}
              {c.marker === "sell" && (
                <path d={`M${x(i)} ${y(c.high) - 4}l-4 -7h8z`} fill="#bb4545" />
              )}
            </g>
          );
        })}
        {Array.from(
          new Set([
            0,
            Math.floor((candles.length - 1) / 2),
            candles.length - 1,
          ]),
        ).map((i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 4}
            textAnchor={
              i === 0 ? "start" : i === candles.length - 1 ? "end" : "middle"
            }
            fontSize="11"
            fill="#8492a0"
          >
            {candles[i].label}
          </text>
        ))}
        {hover !== null && (
          <line
            x1={x(index)}
            x2={x(index)}
            y1={top}
            y2={height - bottom}
            stroke="#7b8794"
            strokeDasharray="3 3"
          />
        )}
      </svg>
    </div>
  );
}
