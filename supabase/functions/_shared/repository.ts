import { ApiError, type Job } from "./protocol.ts";
import type { Identity, Repository } from "./handler.ts";

export class SupabaseRepository implements Repository {
  constructor(
    private url: string,
    private publicKey: string,
    private serviceKey: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async request(path: string, body?: unknown) {
    const response = await this.fetcher(`${this.url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: this.serviceKey,
        ...(!this.serviceKey.startsWith("sb_secret_")
          ? { Authorization: `Bearer ${this.serviceKey}` }
          : {}),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const raw = await response.text();
    let data: any;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      throw new ApiError("server_error", 503);
    }
    if (!response.ok) {
      const known = [
        "access_denied",
        "demo_paused",
        "request_exists",
        "busy",
        "daily_limit",
        "rate_limit",
        "invalid_job",
        "invalid_request",
      ];
      const code = known.find((code) => data?.message === code);
      throw new ApiError(
        code || "server_error",
        code === "access_denied"
          ? 403
          : code === "invalid_job" || code === "request_exists"
            ? 409
            : code === "daily_limit" || code === "rate_limit" || code === "busy"
              ? 429
              : 503,
      );
    }
    return data;
  }
  async authenticate(token: string): Promise<Identity> {
    const response = await this.fetcher(`${this.url}/auth/v1/user`, {
      headers: { apikey: this.publicKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError("sign_in_required", 401);
    }
    const user = await response.json();
    return {
      id: user.id,
      email: user.email,
      confirmed: !!user.email_confirmed_at,
    };
  }
  claim(user: Identity): Promise<boolean> {
    return this.request("/rest/v1/rpc/bito_claim_member", {
      p_uid: user.id,
      p_email: user.email,
    });
  }
  reserve(
    uid: string,
    device: string,
    id: string,
    context: { contents: unknown; instructions?: string },
    round?: number,
  ): Promise<Job> {
    return this.request("/rest/v1/rpc/bito_reserve", {
      p_uid: uid,
      p_device: device,
      p_id: id,
      p_contents: context.contents,
      p_instructions: context.instructions || null,
      p_round: round ?? null,
    });
  }
  async get(uid: string, device: string, id: string): Promise<Job> {
    const rows = await this.request(
      `/rest/v1/demo_jobs?id=eq.${id}&user_id=eq.${uid}&device_id=eq.${device}&select=*`,
    );
    if (rows?.length !== 1) throw new ApiError("invalid_job", 409);
    return rows[0];
  }
  finish(
    job: Job,
    status: string,
    contents: unknown = [],
    pending: unknown = [],
    usage = { input: 0, output: 0 },
  ): Promise<boolean> {
    return this.request("/rest/v1/rpc/bito_finish", {
      p_uid: job.user_id,
      p_device: job.device_id,
      p_id: job.id,
      p_round: job.round,
      p_status: status,
      p_contents: contents,
      p_pending: pending,
      p_input: usage.input,
      p_output: usage.output,
    });
  }
  async cancel(uid: string, device: string, id: string) {
    await this.request("/rest/v1/rpc/bito_cancel", {
      p_uid: uid,
      p_device: device,
      p_id: id,
    });
  }
}
