import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { hashPassword, createToken, setAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { username, password, turnstileToken } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "请输入用户名和密码" },
        { status: 400 }
      );
    }

    // Turnstile 人机验证
    if (!turnstileToken) {
      return NextResponse.json(
        { error: "请完成人机验证" },
        { status: 403 }
      );
    }

    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
        }),
      }
    );

    const verifyResult = await verifyResponse.json();

    if (!verifyResult.success) {
      return NextResponse.json(
        { error: "人机验证失败，请重试" },
        { status: 403 }
      );
    }

    if (username.length < 2 || username.length > 50) {
      return NextResponse.json(
        { error: "用户名长度需要 2-50 个字符" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码至少 6 个字符" },
        { status: 400 }
      );
    }

    // 检查用户名是否已存在
    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "用户名已被注册" },
        { status: 409 }
      );
    }

    // 创建用户
    const hash = await hashPassword(password);
    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
      [username, hash]
    );

    const user = result.rows[0];

    // 自动登录：签发 JWT 并设置 cookie
    const token = await createToken({
      userId: user.id,
      username: user.username,
    });
    await setAuthCookie(token);

    return NextResponse.json({ username: user.username });
  } catch (error) {
    console.error("[auth] 注册错误:", error);
    return NextResponse.json({ error: "注册失败，请重试" }, { status: 500 });
  }
}
