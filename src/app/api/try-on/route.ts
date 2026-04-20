import { NextRequest, NextResponse } from "next/server";

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const MODEL = "aitryon";
const BASE_URL = "https://dashscope.aliyuncs.com";

if (!DASHSCOPE_API_KEY) {
  console.warn(
    "DASHSCOPE_API_KEY is not set. Please add it to .env.local"
  );
}

/** Upload image to DashScope temporary storage and return oss:// URL */
async function uploadImageToOss(file: File): Promise<string> {
  // Step 1: Get upload policy
  const policyRes = await fetch(
    `${BASE_URL}/api/v1/uploads?action=getPolicy&model=${MODEL}`,
    {
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!policyRes.ok) {
    const text = await policyRes.text();
    throw new Error(`Failed to get upload policy: ${text}`);
  }

  const policyData = (await policyRes.json()).data;
  const fileName = file.name || "image.jpg";
  const key = `${policyData.upload_dir}/${fileName}`;

  // Step 2: Upload file to OSS
  const formData = new FormData();
  formData.append("OSSAccessKeyId", policyData.oss_access_key_id);
  formData.append("Signature", policyData.signature);
  formData.append("policy", policyData.policy);
  formData.append("x-oss-object-acl", policyData.x_oss_object_acl);
  formData.append("x-oss-forbid-overwrite", policyData.x_oss_forbid_overwrite);
  formData.append("key", key);
  formData.append("success_action_status", "200");
  formData.append("file", file);

  const uploadRes = await fetch(policyData.upload_host, {
    method: "POST",
    body: formData,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Failed to upload file to OSS: ${text}`);
  }

  return `oss://${key}`;
}

/** Create async try-on task, return task_id */
async function createTryOnTask(
  personImageUrl: string,
  garmentImageUrl: string
): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/api/v1/services/aigc/image2image/image-synthesis`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
        "X-DashScope-OssResourceResolve": "enable",
      },
      body: JSON.stringify({
        model: MODEL,
        input: {
          person_image_url: personImageUrl,
          top_garment_url: garmentImageUrl,
        },
        parameters: {
          resolution: -1,
          restore_face: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create try-on task: ${text}`);
  }

  const json = await res.json();

  if (json.code) {
    throw new Error(`API error: ${json.code} - ${json.message}`);
  }

  return json.output.task_id;
}

/** Poll task result, return image_url when succeeded */
async function pollTaskResult(
  taskId: string,
  maxAttempts = 20,
  intervalMs = 3000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const res = await fetch(`${BASE_URL}/api/v1/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to poll task: ${text}`);
    }

    const json = await res.json();
    const status = json.output?.task_status;

    if (status === "SUCCEEDED") {
      return json.output.image_url;
    }

    if (status === "FAILED") {
      throw new Error(
        `Task failed: ${json.output?.code} - ${json.output?.message}`
      );
    }

    // Still PENDING / PRE-PROCESSING / RUNNING / POST-PROCESSING — continue polling
  }

  throw new Error("Task timed out after maximum polling attempts");
}

export async function POST(request: NextRequest) {
  if (!DASHSCOPE_API_KEY) {
    return NextResponse.json(
      { error: "服务未配置 API Key，请联系管理员" },
      { status: 500 }
    );
  }

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

    // Upload images to DashScope temporary storage
    const [personOssUrl, garmentOssUrl] = await Promise.all([
      uploadImageToOss(personImage),
      uploadImageToOss(garmentImage),
    ]);

    // Create try-on task
    const taskId = await createTryOnTask(personOssUrl, garmentOssUrl);

    // Poll for result
    const imageUrl = await pollTaskResult(taskId);

    return NextResponse.json({ imageUrl });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成试衣效果图失败，请重试";
    console.error("Try-on error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
