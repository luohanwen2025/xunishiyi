"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL = 3000; // 3 秒轮询一次
const POLL_MAX_ATTEMPTS = 30; // 最多轮询 30 次 = 90 秒

const STATUS_LABELS: Record<string, string> = {
  PENDING: "排队中...",
  "PRE-PROCESSING": "预处理中...",
  RUNNING: "AI 正在试穿...",
  "POST-PROCESSING": "后处理中...",
  SUCCEEDED: "完成",
  FAILED: "失败",
  UNKNOWN: "查询中...",
  TIMEOUT: "超时",
};

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [personImage, setPersonImage] = useState<File | null>(null);
  const [garmentImage, setGarmentImage] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<string | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const personInputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<boolean>(false);

  // Fetch current user
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUsername(data.user.username);
      })
      .catch(() => {});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  function handleFileSelect(
    file: File,
    setFile: (f: File | null) => void,
    setPreview: (url: string | null) => void
  ) {
    const validTypes = ["image/jpeg", "image/png", "image/jpg", "image/bmp", "image/heic"];
    if (!validTypes.includes(file.type)) {
      setError("请上传 JPG、PNG、BMP 或 HEIC 格式的图片");
      return;
    }

    if (file.size < 5 * 1024) {
      setError("图片文件太小，请上传大于 5KB 的图片");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("图片文件太大，请上传小于 5MB 的图片");
      return;
    }

    setError(null);
    setFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function handleDrop(
    e: React.DragEvent,
    setFile: (f: File | null) => void,
    setPreview: (url: string | null) => void
  ) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file, setFile, setPreview);
  }

  /** Step 2: 轮询任务状态直到成功或失败 */
  const pollStatus = useCallback(async (taskId: string) => {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      if (abortRef.current) return;

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      if (abortRef.current) return;

      try {
        const res = await fetch(`/api/status?taskId=${taskId}`);
        const data = await res.json();

        setPollCount(i + 1);
        setTaskStatus(data.status);

        if (data.status === "SUCCEEDED") {
          setResultImageUrl(data.imageUrl);
          setLoading(false);
          return;
        }

        if (data.status === "FAILED") {
          setError(data.errorMessage || data.error || "生成失败，请重试");
          setLoading(false);
          return;
        }

        // Other statuses: continue polling
      } catch {
        // Network error on single poll — don't give up, retry next cycle
        console.warn(`[tryon] 轮询第 ${i + 1} 次网络错误，继续重试`);
      }
    }

    // Exhausted all attempts
    if (!abortRef.current) {
      setError("生成超时（超过 90 秒），请重试");
      setLoading(false);
    }
  }, []);

  /** Step 1: 上传图片 + 创建任务，然后开始轮询 */
  async function handleTryOn() {
    if (!personImage || !garmentImage) {
      setError("请先上传人物照片和服装照片");
      return;
    }

    setLoading(true);
    setError(null);
    setResultImageUrl(null);
    setTaskStatus(null);
    setPollCount(0);
    abortRef.current = false;

    try {
      // Step 1: Create task
      const formData = new FormData();
      formData.append("personImage", personImage);
      formData.append("garmentImage", garmentImage);

      const res = await fetch("/api/try-on", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "创建任务失败，请重试");
        setLoading(false);
        return;
      }

      const taskId: string = data.taskId;
      setTaskStatus("PENDING");

      // Step 2: Poll for result
      await pollStatus(taskId);
    } catch {
      setError("网络错误，请检查网络连接后重试");
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!resultImageUrl) return;
    const downloadUrl = `/api/download?url=${encodeURIComponent(resultImageUrl)}`;
    window.open(downloadUrl, "_blank");
  }

  function handleReset() {
    abortRef.current = true;
    setPersonImage(null);
    setGarmentImage(null);
    setPersonPreview(null);
    setGarmentPreview(null);
    setResultImageUrl(null);
    setError(null);
    setTaskStatus(null);
    setPollCount(0);
    setLoading(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const canSubmit = personImage && garmentImage && !loading;

  return (
    <div className="flex flex-col flex-1 items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-2xl">
        {/* User Bar */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm text-[#b0aea5]">
            {username ? `${username}，你好` : ""}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-[#b0aea5] hover:text-[#141413] transition-colors"
            style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}
          >
            退出登录
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#141413] mb-3 tracking-tight"
              style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}>
            AI 虚拟试衣
          </h1>
          <p className="text-[#b0aea5] text-base leading-relaxed">
            上传你的照片和服装图片，看看穿上是什么效果
          </p>
        </div>

        {/* Upload Area */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          <UploadBox
            label="人物照片"
            hint="正面全身照、背景简洁、无遮挡"
            previewUrl={personPreview}
            inputRef={personInputRef}
            onFile={(file) => handleFileSelect(file, setPersonImage, setPersonPreview)}
            onDrop={(e) => handleDrop(e, setPersonImage, setPersonPreview)}
            onClear={() => { setPersonImage(null); setPersonPreview(null); }}
          />
          <UploadBox
            label="服装照片"
            hint="平铺图、背景干净、单件服装"
            previewUrl={garmentPreview}
            inputRef={garmentInputRef}
            onFile={(file) => handleFileSelect(file, setGarmentImage, setGarmentPreview)}
            onDrop={(e) => handleDrop(e, setGarmentImage, setGarmentPreview)}
            onClear={() => { setGarmentImage(null); setGarmentPreview(null); }}
          />
        </div>

        {/* Photo Tips */}
        <div className="bg-white border border-[#e8e6dc] rounded-xl p-5 mb-8 text-sm relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#d97757]" />
          <p className="font-medium text-[#141413] mb-2 pl-2"
             style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}>
            拍照小贴士
          </p>
          <ul className="list-disc list-inside space-y-1 text-[#b0aea5] pl-2">
            <li>人物照片：正面站姿、光线充足、双手双脚可见、无配饰遮挡</li>
            <li>服装照片：平铺拍摄、衣服平整无折叠、背景简约干净</li>
          </ul>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50/70 border border-red-200/70 rounded-xl p-4 mb-8 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 mb-10">
          <button
            onClick={handleTryOn}
            disabled={!canSubmit}
            className="flex-1 h-12 rounded-xl bg-[#d97757] text-white font-medium text-base
              hover:bg-[#c4684d] disabled:bg-[#e8e6dc] disabled:text-[#b0aea5] disabled:cursor-not-allowed
              transition-colors"
            style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}
          >
            {loading ? "生成中..." : "开始试衣"}
          </button>
          {(resultImageUrl || personImage || garmentImage) && (
            <button
              onClick={handleReset}
              className="h-12 px-6 rounded-xl border border-[#e8e6dc] text-[#141413] font-medium
                hover:bg-white transition-colors"
              style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}
            >
              重来
            </button>
          )}
        </div>

        {/* Loading Indicator */}
        {loading && (
          <div className="text-center mb-10">
            <div className="inline-block w-8 h-8 border-[3px] border-[#e8e6dc] border-t-[#d97757] rounded-full animate-spin" />
            <p className="text-[#b0aea5] mt-4 text-sm">
              {taskStatus
                ? STATUS_LABELS[taskStatus] || taskStatus
                : "正在提交任务..."}
            </p>
            {pollCount > 0 && (
              <p className="text-[#b0aea5]/60 mt-1 text-xs">
                已等待 {pollCount * 3} 秒...
              </p>
            )}
          </div>
        )}

        {/* Result Image */}
        {resultImageUrl && !loading && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-[#141413] mb-4"
                style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}>
              试衣效果
            </h2>
            <div className="bg-white rounded-xl border border-[#e8e6dc] overflow-hidden shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultImageUrl}
                alt="虚拟试衣效果图"
                className="w-full h-auto"
              />
            </div>
            <button
              onClick={handleDownload}
              className="mt-5 w-full h-12 rounded-xl bg-[#788c5d] text-white font-medium text-base
                hover:bg-[#6a7c50] transition-colors"
              style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}
            >
              下载效果图
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Upload Box Component ─── */

function UploadBox({
  label,
  hint,
  previewUrl,
  inputRef,
  onFile,
  onDrop,
  onClear,
}: {
  label: string;
  hint: string;
  previewUrl: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onClear: () => void;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={() => !previewUrl && inputRef.current?.click()}
      className={`relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer
        transition-all duration-200 min-h-[220px] flex flex-col items-center justify-center
        ${
          previewUrl
            ? "border-[#e8e6dc] bg-white"
            : "border-[#e8e6dc] hover:border-[#d97757] hover:bg-white/60"
        }`}
    >
      {previewUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={label}
            className="max-h-40 rounded-lg object-contain mb-3"
          />
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="text-sm text-[#d97757] hover:text-[#c4684d] transition-colors"
          >
            重新上传
          </button>
        </>
      ) : (
        <>
          <svg
            className="w-10 h-10 text-[#b0aea5] mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm font-medium text-[#141413] mb-1"
             style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}>
            {label}
          </p>
          <p className="text-xs text-[#b0aea5]">点击或拖拽上传</p>
        </>
      )}

      <p className="text-xs text-[#b0aea5] mt-3">{hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg,image/bmp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
