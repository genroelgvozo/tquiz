export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = `Ошибка ${res.status}`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") detail = body.detail;
    else if (Array.isArray(body.detail) && body.detail[0]?.msg) detail = body.detail[0].msg;
  } catch {
    /* not JSON */
  }
  return new ApiError(res.status, detail);
}

export async function api<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface UploadedMedia {
  filename: string;
  kind: "image" | "audio";
  url: string;
}

export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/media", { method: "POST", credentials: "include", body: form });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as UploadedMedia;
}
