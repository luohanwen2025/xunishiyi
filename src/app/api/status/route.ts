import { NextRequest, NextResponse } from "next/server";
import { queryTask, TryOnError, TaskResult } from "@/lib/tryon-service";

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");

  if (!taskId) {
    return NextResponse.json(
      { error: "缺少 taskId 参数" },
      { status: 400 }
    );
  }

  try {
    const result: TaskResult = await queryTask(taskId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TryOnError) {
      const statusMap: Record<string, number> = {
        UNAUTHORIZED: 401,
        RATE_LIMITED: 429,
        INVALID_PARAMETER: 400,
        MISSING_API_KEY: 500,
      };
      const status = statusMap[error.code] || 500;
      return NextResponse.json(
        { status: "FAILED", error: error.message },
        { status }
      );
    }

    const message =
      error instanceof Error ? error.message : "查询任务状态失败";
    console.error("[tryon] 查询错误:", message);
    return NextResponse.json(
      { status: "FAILED", error: message },
      { status: 500 }
    );
  }
}
