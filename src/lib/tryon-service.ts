/**
 * 阿里云百炼 AI 试衣 API 封装层
 *
 * 三个核心函数：
 *   uploadImageToOss  — 上传图片到临时存储，返回 oss:// URL
 *   createTask        — 创建试衣任务，返回 taskId
 *   queryTask         — 查询任务状态，返回 status + imageUrl
 */

const BASE_URL = "https://dashscope.aliyuncs.com";
const MODEL = "aitryon-plus";

function getApiKey(): string {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) {
    throw new TryOnError("DASHSCOPE_API_KEY 未配置", "MISSING_API_KEY");
  }
  return key;
}

function log(message: string) {
  console.log(`[tryon] ${new Date().toISOString()} ${message}`);
}

/** 自定义错误类型，携带 error code 方便上层区分处理 */
export class TryOnError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "TryOnError";
    this.code = code;
  }
}

/** 将阿里云 API 的 HTTP 错误统一转换为 TryOnError */
function handleApiError(label: string, res: Response, body: string): never {
  const status = res.status;

  log(`错误: ${label} | HTTP ${status} | ${body.slice(0, 200)}`);

  if (status === 401) {
    throw new TryOnError(
      "API 认证失败，请检查 API Key 是否正确",
      "UNAUTHORIZED"
    );
  }
  if (status === 429) {
    throw new TryOnError(
      "请求过于频繁，请稍后再试",
      "RATE_LIMITED"
    );
  }
  if (status === 400) {
    // 尝试解析阿里云返回的具体错误信息
    let detail = body;
    try {
      const json = JSON.parse(body);
      detail = json.message || json.output?.message || body;
    } catch { /* keep raw body */ }
    throw new TryOnError(
      `参数错误: ${detail}`,
      "INVALID_PARAMETER"
    );
  }

  throw new TryOnError(
    `${label}失败 (HTTP ${status})`,
    "API_ERROR"
  );
}

// ─── 上传图片到临时存储 ───

export async function uploadImageToOss(file: File): Promise<string> {
  const apiKey = getApiKey();

  log(`上传图片: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);

  // Step 1: 获取上传凭证
  const policyRes = await fetch(
    `${BASE_URL}/api/v1/uploads?action=getPolicy&model=${MODEL}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!policyRes.ok) {
    const text = await policyRes.text();
    handleApiError("获取上传凭证", policyRes, text);
  }

  const policyData = (await policyRes.json()).data;
  const fileName = file.name || "image.jpg";
  const key = `${policyData.upload_dir}/${fileName}`;

  // Step 2: 上传文件到 OSS
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
    handleApiError("上传文件到 OSS", uploadRes, text);
  }

  const ossUrl = `oss://${key}`;
  log(`上传成功: ${ossUrl}`);
  return ossUrl;
}

// ─── 创建试衣任务 ───

export async function createTask(
  personImageUrl: string,
  garmentImageUrl: string
): Promise<string> {
  const apiKey = getApiKey();

  log(`创建试衣任务: person=${personImageUrl.slice(0, 40)}... garment=${garmentImageUrl.slice(0, 40)}...`);

  const res = await fetch(
    `${BASE_URL}/api/v1/services/aigc/image2image/image-synthesis/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
    handleApiError("创建试衣任务", res, text);
  }

  const json = await res.json();

  // 阿里云可能在 200 响应中返回业务错误
  if (json.code) {
    log(`业务错误: ${json.code} - ${json.message}`);
    throw new TryOnError(
      json.message || "创建任务失败",
      json.code
    );
  }

  const taskId = json.output.task_id;
  log(`任务创建成功: taskId=${taskId} status=${json.output.task_status}`);
  return taskId;
}

// ─── 查询任务状态 ───

export type TaskStatus =
  | "PENDING"
  | "PRE-PROCESSING"
  | "RUNNING"
  | "POST-PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "UNKNOWN"
  | "TIMEOUT";

export interface TaskResult {
  status: TaskStatus;
  imageUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

export async function queryTask(taskId: string): Promise<TaskResult> {
  const apiKey = getApiKey();

  const res = await fetch(`${BASE_URL}/api/v1/tasks/${taskId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    handleApiError("查询任务状态", res, text);
  }

  const json = await res.json();
  const status = json.output?.task_status as TaskStatus | undefined;

  log(`查询任务: taskId=${taskId} status=${status || "UNKNOWN"}`);

  if (status === "SUCCEEDED") {
    return {
      status: "SUCCEEDED",
      imageUrl: json.output.image_url,
    };
  }

  if (status === "FAILED") {
    return {
      status: "FAILED",
      errorCode: json.output?.code,
      errorMessage: json.output?.message,
    };
  }

  // PENDING / PRE-PROCESSING / RUNNING / POST-PROCESSING / UNKNOWN
  return {
    status: status || "UNKNOWN",
  };
}
