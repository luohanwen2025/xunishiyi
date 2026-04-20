import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get("url");

  if (!imageUrl) {
    return NextResponse.json({ error: "缺少图片 URL" }, { status: 400 });
  }

  try {
    const res = await fetch(imageUrl);

    if (!res.ok) {
      return NextResponse.json(
        { error: "下载图片失败" },
        { status: res.status }
      );
    }

    const blob = await res.blob();
    const headers = new Headers();
    headers.set(
      "Content-Type",
      res.headers.get("Content-Type") || "image/jpeg"
    );
    headers.set(
      "Content-Disposition",
      `attachment; filename="virtual-tryon-${Date.now()}.jpg"`
    );

    return new NextResponse(blob, { headers });
  } catch {
    return NextResponse.json(
      { error: "下载图片失败，请重试" },
      { status: 500 }
    );
  }
}
