"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Settings } from "lucide-react";
import { ApiSettingsModal } from "@/components/api-settings-modal";
import { getApiHeaders } from "@/lib/api-config";

interface HeaderProps {
  activeTab: "backtest" | "live";
  connected?: boolean;
  statusText?: string;
}

export function Header({
  activeTab,
  connected: propsConnected,
  statusText: propsStatusText,
}: HeaderProps) {
  const [connected, setConnected] = useState<boolean>(propsConnected ?? false);
  const [statusText, setStatusText] = useState<string>(
    propsStatusText ??
      (propsConnected ? "AI 모델 연결됨" : "AI 모델 연결 대기"),
  );
  const [modalOpen, setModalOpen] = useState(false);

  const checkStatus = async () => {
    try {
      const headers = getApiHeaders();
      const r = await fetch("/api/status", { headers });
      const d = (await r.json()) as {
        connected: boolean;
        label?: string;
      };
      setConnected(d.connected);
      if (d.label) setStatusText(d.label);
    } catch {
      setConnected(false);
      setStatusText("AI 모델 연결 대기");
    }
  };

  useEffect(() => {
    void checkStatus();
    const timer = setInterval(() => void checkStatus(), 15000);
    const handleConfigChange = () => void checkStatus();
    window.addEventListener("api-config-changed", handleConfigChange);

    return () => {
      clearInterval(timer);
      window.removeEventListener("api-config-changed", handleConfigChange);
    };
  }, []);

  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/backtest">
          <span className="brand-icon">
            <Activity size={21} />
          </span>
          Jev<span className="brand-light">/</span>Lab
        </Link>
        <span className="top-context">
          {activeTab === "backtest" ? "BACKTEST WORKSPACE" : "LIVE MARKET"}
        </span>

        <nav className="header-nav">
          <Link
            href="/backtest"
            className={`nav-link ${activeTab === "backtest" ? "active" : ""}`}
          >
            백테스트
          </Link>
          <Link
            href="/live"
            className={`nav-link ${activeTab === "live" ? "active" : ""}`}
          >
            실시간 판단
          </Link>
        </nav>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="connection cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="API 연결 설정 변경"
          >
            <span className={`status-dot ${connected ? "connected" : ""}`} />
            {statusText}
            <Settings
              size={14}
              className="ml-1 text-slate-400 hover:text-slate-600"
            />
          </button>
        </div>
      </header>

      <ApiSettingsModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => void checkStatus()}
      />
    </>
  );
}
