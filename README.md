# Jev / Lab — Bitcoin backtesting

Browser-based BTC/USDT spot, long-only research workspace. Korean UI; daily UTC candles; 2–366 completed days per run.

## Run locally

Requires Node.js >=22.13.0. Run `npm run install:ci`, then `npm run dev`.

The app uses the local openjev server at `http://127.0.0.1:8000` through server-side proxy routes. Set `JEV_BASE_URL` in `.env` to change it. `/health` controls connection status; `/v1/systemone` supplies Choice answers. `TYPESAFE_MODEL` is empty by default so the server uses its loaded model, whose name appears in the UI. `TYPESAFE_API_KEY` is optional for servers requiring authentication. Never commit secrets. Restart the development server after changing `.env`.

Run the web app and model server on the same computer. A remote deployment cannot reach your computer via its own `127.0.0.1`; this configuration is for local operation.

## Modes

- Demo: deterministic synthetic prices and SMA rules, explicitly labeled.
- Historical: Binance public BTCUSDT daily candles and SMA rules.
- Jev: real candles and server-side local openjev Choice requests. Enabled when local health reports ready. One local inference per simulated day; no live orders. Requests use a 120-second timeout and propagate cancellation. The UI checks health every 15 seconds.

## Live entry view

Open `/live` for manual evaluation or opt-in automatic refresh (30 seconds after each response). Uses Binance BTCUSDT ticker and the latest 60 closed one-minute bars, evaluated by the same local openjev server. The local model chooses among buy, sell, and wait simultaneously for a 5–15 minute outlook, without any portfolio-position input or confidence threshold override. These are model option probabilities, not calibrated forecasts of returns. No orders are submitted.

Requests do not overlap. Automatic refresh skips hidden tabs and aborts on stop/navigation. Results older than 90 seconds or followed by errors are marked unavailable as current signals. Missing/stale candles, impossible OHLC values, and malformed probabilities fail closed. Both live and backtest price charts render OHLC candles with keyboard/pointer inspection; the equity comparison remains an area chart. The latest 50 evaluations are kept only in page memory.

## Backtest method

21 warm-up candles; indicators use only completed prior bars. SMA5/SMA20 with a 0.5% band controls the baseline. Rule score is a fixed 0.75, not a calibrated probability. Jev receives the current position (`flat` or `long`) and uses the returned probability of its chosen option, not the separate confidence field. The default decision threshold is 0.50 and can be changed in the experiment settings. A choice must meet the configured threshold to trade. A position policy guard prevents contradictory model actions: bullish flat positions can buy, bearish long positions can sell, and mixed signals remain hold. Buy uses all available cash; sell closes all units; repeated buys or empty sells hold. Execution uses the next daily open plus adverse slippage and fees. The final position remains open and is marked to close. Benchmark buy-and-hold has the same entry costs. Drawdown includes initial capital and uses daily close equity, not intraday lows.

Results live in memory during the session. Download JSON to preserve settings, per-day inputs, Jev request/response, model name, fills and equity. API failures stop the run and label partial results; no silent synthetic fallback. Historical model training contamination cannot be excluded. Backtest returns are not evidence of prospective predictive performance.

## Git hygiene

Local environment files, dependencies, build output, framework caches, Wrangler state, and checkout-local tool state are excluded by `.gitignore`. Commit `.env.example` for shared configuration names, but never commit `.env` or API keys.

## Validation

`node --experimental-strip-types --test tests/*.test.mjs`

`npx tsc --noEmit`

`npm run build`

## References

- https://docs.typesafe.ai/introduction/quickstart
- https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints

Hosted site identity is stored in `.openai/hosting.json`. This project uses the Sites Vinext starter and Cloudflare Worker-compatible routes.
