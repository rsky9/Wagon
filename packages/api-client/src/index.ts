export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClientOptions {
  baseUrl: string
  getToken?: () => string | null
  /**
   * Called on 401 responses. Return true to signal the token was refreshed so
   * the request is retried once with the new token; false/undefined to give up.
   */
  onUnauthorized?: () => Promise<boolean> | boolean | void
}

export function createApiClient({ baseUrl, getToken, onUnauthorized }: ApiClientOptions) {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = getToken?.()
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    if (res.status === 401 && onUnauthorized) {
      const refreshed = await onUnauthorized()
      if (refreshed) {
        // Retry once with the rotated access token.
        const retryHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        const newToken = getToken?.()
        if (newToken) retryHeaders.Authorization = `Bearer ${newToken}`
        const retry = await fetch(`${baseUrl}${path}`, {
          method,
          headers: retryHeaders,
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (retry.ok) {
          if (retry.status === 204) return undefined as T
          return (await retry.json()) as T
        }
        if (retry.status === 401) {
          throw new ApiError(401, 'Session expired')
        }
        let retryMessage = `Request failed (${retry.status})`
        try {
          const data = await retry.json()
          if (Array.isArray(data.message)) retryMessage = data.message.join(', ')
          else if (typeof data.message === 'string') retryMessage = data.message
        } catch {
          // non-JSON error body
        }
        throw new ApiError(retry.status, retryMessage)
      }
    }

    if (res.status === 401) {
      onUnauthorized?.()
    }

    if (!res.ok) {
      let message = `Request failed (${res.status})`
      let code: string | undefined
      try {
        const data = await res.json()
        if (Array.isArray(data.message)) {
          message = data.message.join(', ')
        } else if (typeof data.message === 'string') {
          message = data.message
        }
        code = typeof data.error === 'string' ? data.error : undefined
      } catch {
        // non-JSON error body
      }
      throw new ApiError(res.status, message, code)
    }

    if (res.status === 204) {
      return undefined as T
    }
    return (await res.json()) as T
  }

  return {
    request,
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

/**
 * PUT a binary file to a presigned URL (S3/MinIO).
 * React Native supports `{uri, name, type}` as a fetch body.
 */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  file: { uri: string; name: string; type: string },
): Promise<void> {
  const isRn =
    typeof file.uri === 'string' &&
    (file.uri.startsWith('file://') || file.uri.startsWith('content://'))
  const body: BodyInit | undefined = isRn
    ? (file as unknown as BodyInit)
    : await fileToBlob(file.uri, file.type)

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body,
  })
  if (!res.ok) {
    throw new ApiError(res.status, `Upload failed (${res.status})`)
  }
}

/** Convert a local file:// URI to a Blob (web / fetch-as-blob paths). */
async function fileToBlob(uri: string, type: string): Promise<Blob> {
  const res = await fetch(uri)
  return res.blob()
}
