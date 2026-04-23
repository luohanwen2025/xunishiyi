"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tab = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError("请输入用户名和密码");
      return;
    }

    setLoading(true);

    try {
      const endpoint =
        tab === "register"
          ? "/api/auth/register"
          : "/api/auth/login";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "操作失败，请重试");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-semibold text-[#141413] mb-2 tracking-tight"
            style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}
          >
            AI 虚拟试衣
          </h1>
          <p className="text-[#b0aea5] text-sm">
            {tab === "login" ? "登录你的账号" : "创建新账号"}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex mb-6 bg-white border border-[#e8e6dc] rounded-xl p-1">
          <button
            onClick={() => { setTab("login"); setError(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
              ${
                tab === "login"
                  ? "bg-[#d97757] text-white"
                  : "text-[#b0aea5] hover:text-[#141413]"
              }`}
            style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}
          >
            登录
          </button>
          <button
            onClick={() => { setTab("register"); setError(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
              ${
                tab === "register"
                  ? "bg-[#d97757] text-white"
                  : "text-[#b0aea5] hover:text-[#141413]"
              }`}
            style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}
          >
            注册
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium text-[#141413] mb-1.5"
              style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}
            >
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="2-50 个字符"
              className="w-full h-11 px-4 rounded-xl border border-[#e8e6dc] bg-white
                text-[#141413] placeholder-[#b0aea5] text-sm
                focus:outline-none focus:border-[#d97757] focus:ring-1 focus:ring-[#d97757]
                transition-colors"
              autoComplete="username"
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-[#141413] mb-1.5"
              style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}
            >
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 个字符"
              className="w-full h-11 px-4 rounded-xl border border-[#e8e6dc] bg-white
                text-[#141413] placeholder-[#b0aea5] text-sm
                focus:outline-none focus:border-[#d97757] focus:ring-1 focus:ring-[#d97757]
                transition-colors"
              autoComplete={tab === "register" ? "new-password" : "current-password"}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50/70 border border-red-200/70 rounded-xl p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-[#d97757] text-white font-medium text-base
              hover:bg-[#c4684d] disabled:bg-[#e8e6dc] disabled:text-[#b0aea5] disabled:cursor-not-allowed
              transition-colors"
            style={{ fontFamily: "var(--font-heading), Arial, sans-serif" }}
          >
            {loading
              ? "请稍候..."
              : tab === "login"
                ? "登录"
                : "注册"}
          </button>
        </form>
      </div>
    </div>
  );
}
