import { NextRequest, NextResponse } from "next/server";
import { uploadImageToOss, createTask, TryOnError } from "@/lib/tryon-service";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const personImage = formData.get("personImage") as File | null;
    const garmentImage = formData.get("garmentImage") as File | null;

    if (!personImage || !garmentImage) {
      return NextResponse.json(
        { error: "请同时上传人物照片和服装照片" },
        { status: 400 }
      );
    }

    // Validate file size (5KB ~ 5MB)
    for (const [name, file] of [
      ["人物照片", personImage],
      ["服装照片", garmentImage],
    ] as [string, File][]) {
      if (file.size < 5 * 1024) {
        return NextResponse.json(
          { error: `${name}文件太小，请上传大于 5KB 的图片` },
          { status: 400 }
        );
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: `${name}文件太大，请上传小于 5MB 的图片` },
          { status: 400 }
        );
      }
    }

    // Step 1: Upload images to DashScope temporary storage (parallel)
    const [personOssUrl, garmentOssUrl] = await Promise.all([
      uploadImageToOss(personImage),
      uploadImageToOss(garmentImage),
    ]);

    // Step 2: Create async try-on task (returns immediately with taskId)
    const taskId = await createTask(personOssUrl, garmentOssUrl);

    return NextResponse.json({ taskId });
  } catch (error) {
    if (error instanceof TryOnError) {
      const statusMap: Record<string, number> = {
        UNAUTHORIZED: 401,
        RATE_LIMITED: 429,
        INVALID_PARAMETER: 400,
        MISSING_API_KEY: 500,
      };
      const status = statusMap[error.code] || 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    const message =
      error instanceof Error ? error.message : "生成试衣效果图失败，请重试";
    console.error("[tryon] 未预期错误:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
