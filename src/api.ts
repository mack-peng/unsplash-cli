export type RateLimit = {
  limit: string | null;
  remaining: string | null;
};

export interface UnsplashPhoto {
  id: string;
  description?: string | null;
  alt_description?: string | null;
  width: number;
  height: number;
  color?: string | null;
  urls: Record<string, string>;
  user?: {
    name?: string | null;
    username?: string | null;
    links?: { html?: string };
  };
  links?: {
    html?: string;
    download_location?: string;
  };
}

export interface SearchResponse {
  total: number;
  total_pages: number;
  results: UnsplashPhoto[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class UnsplashApi {
  readonly base: string;
  lastRate: RateLimit = { limit: null, remaining: null };

  constructor(
    private readonly key: string,
    base = process.env.UNSPLASH_API_BASE || 'https://api.unsplash.com',
  ) {
    this.base = base.replace(/\/+$/, '');
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Client-ID ${this.key}`,
      'Accept-Version': 'v1',
    };
  }

  private updateRate(response: Response): void {
    this.lastRate = {
      limit: response.headers.get('x-ratelimit-limit') ?? this.lastRate.limit,
      remaining: response.headers.get('x-ratelimit-remaining') ?? this.lastRate.remaining,
    };
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(this.base + path);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
    }
    const response = await fetch(url, { headers: this.headers() });
    this.updateRate(response);
    if (!response.ok) throw await toApiError(response);
    return (await response.json()) as T;
  }

  search(
    query: string,
    options: {
      perPage?: number;
      page?: number;
      orientation?: string;
      color?: string;
      orderBy?: string;
    } = {},
  ): Promise<SearchResponse> {
    return this.request<SearchResponse>('/search/photos', {
      query,
      per_page: options.perPage,
      page: options.page,
      orientation: options.orientation,
      color: options.color,
      order_by: options.orderBy,
    });
  }

  photo(id: string): Promise<UnsplashPhoto> {
    return this.request<UnsplashPhoto>(`/photos/${encodeURIComponent(id)}`);
  }

  random(): Promise<UnsplashPhoto> {
    return this.request<UnsplashPhoto>('/photos/random');
  }

  async track(downloadLocation: string): Promise<boolean> {
    if (!downloadLocation) return false;
    try {
      const response = await fetch(downloadLocation, { headers: this.headers() });
      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Image download failed (HTTP ${response.status}).`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? '',
    };
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail = '';
  try {
    const body = (await response.json()) as { errors?: string[]; error?: string };
    detail = body.errors?.join('; ') || body.error || '';
  } catch {
    // ignore non-JSON error bodies
  }
  if (response.status === 401) {
    return new ApiError(401, 'Invalid Unsplash Access Key (401). Run `unsplash auth set` to update it.');
  }
  if (response.status === 403 || response.status === 429) {
    return new ApiError(response.status, `Unsplash rate limit reached (${response.status}). Try again later.`);
  }
  return new ApiError(
    response.status,
    `Unsplash API error ${response.status}${detail ? `: ${detail}` : ''}.`,
  );
}
