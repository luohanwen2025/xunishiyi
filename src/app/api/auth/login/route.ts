import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { verifyPassword, createToken, setAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "请输入用户名和密码" },
        { status: 400 }
      );
    }

    // 查找用户
    const result = await pool.query(
      "SELECT id, username, password FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "用户名或密码错误" },
        { status: 401 }
      );
    }

    const user = result.rows[0];

    // 验证密码
    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "用户名或密码错误" },
        { status: 401 }
      );
    }

    // 签发 JWT
    const token = await createToken({
      userId: user.id,
      username: user.username,
    });
    await setAuthCookie(token);

    return NextResponse.json({ username: user.username });
  } catch (error) {
    console.error("[auth] 登录错误:", error);
    return NextResponse.json({ error: "登录失败，请重试" }, { status: 500 });
  }
}
