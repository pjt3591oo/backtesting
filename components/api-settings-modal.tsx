"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Check,
  AlertCircle,
  RefreshCw,
  X,
  Server,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getClientApiConfig,
  saveClientApiConfig,
  getApiHeaders,
  type ApiConfig,
} from "@/lib/api-config";

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function ApiSettingsModal({
  isOpen,
  onClose,
  onSaved,
}: ApiSettingsModalProps) {
  const [config, setConfig] = useState<ApiConfig>(getClientApiConfig());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfig(getClientApiConfig());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleTestAndSave() {
    setTesting(true);
    setTestResult(null);
    try {
      const headers = getApiHeaders(config);
      const res = await fetch("/api/status", { headers });
      const data = (await res.json()) as {
        connected: boolean;
        label?: string;
        error?: string;
      };

      if (data.connected) {
        saveClientApiConfig(config);
        setTestResult({
          success: true,
          message: `${data.label || "성공적으로 연결되었습니다."}`,
        });
        if (onSaved) onSaved();
      } else {
        setTestResult({
          success: false,
          message:
            data.error ||
            "서버 응답을 받지 못했습니다. 주소와 API Key를 확인해주세요.",
        });
      }
    } catch (e) {
      setTestResult({
        success: false,
        message: e instanceof Error ? e.message : "연결 테스트에 실패했습니다.",
      });
    } finally {
      setTesting(false);
    }
  }

  function applyPreset(preset: "jev" | "custom") {
    if (preset === "jev") {
      setConfig({
        baseUrl: "http://127.0.0.1:8000",
        apiKey: "",
        model: "",
        provider: "jev",
      });
    } else {
      setConfig({
        baseUrl: "",
        apiKey: "",
        model: "",
        provider: "custom",
      });
    }
    setTestResult(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
          aria-label="닫기"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
            <Settings size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              AI API 연결 설정
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              로컬 Jev 또는 외부 커스텀 AI API 서버를 설정하세요.
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">
            빠른 프리셋 선택
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => applyPreset("jev")}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-all ${
                config.provider === "jev"
                  ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
              }`}
            >
              <Server size={14} /> 로컬 Jev (127.0.0.1)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("custom")}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-all ${
                config.provider === "custom"
                  ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
              }`}
            >
              <Globe size={14} /> 외부 커스텀 API
            </button>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-3.5 mb-5">
          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">
              API 엔드포인트 (Base URL)
            </label>
            <Input
              value={config.baseUrl}
              onChange={(e) =>
                setConfig({ ...config, baseUrl: e.target.value })
              }
              placeholder="http://127.0.0.1:8000 또는 https://your-custom-ai-server.com"
              className="text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">
              API Key (선택)
            </label>
            <Input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="Bearer Token / API Key"
              className="text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 block">
              모델명 (Model Name / 선택)
            </label>
            <Input
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder="예: jev-v1, llama3, custom-model"
              className="text-sm font-mono"
            />
          </div>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div
            className={`flex items-start gap-2 p-3 rounded-xl mb-4 text-xs font-medium ${
              testResult.success
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
            }`}
          >
            {testResult.success ? (
              <Check size={16} className="shrink-0 text-emerald-600 mt-0.5" />
            ) : (
              <AlertCircle
                size={16}
                className="shrink-0 text-rose-600 mt-0.5"
              />
            )}
            <div>{testResult.message}</div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} size="sm">
            취소
          </Button>
          <Button onClick={handleTestAndSave} disabled={testing} size="sm">
            {testing ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {testing ? "연결 확인 중..." : "테스트 & 저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}
