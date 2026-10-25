import { createHandler } from "../_shared/handler.ts";
import { SupabaseRepository } from "../_shared/repository.ts";
import { providerConfig } from "../_shared/provider.ts";

// Secrets live only in Supabase. Never copy this configuration into Vite or the
// desktop installer. No sensitive request/response contents are logged here.
const url = Deno.env.get("SUPABASE_URL")!;
const publicKeys = JSON.parse(
  Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}",
);
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
Deno.serve(
  createHandler({
    repository: new SupabaseRepository(
      url,
      publicKeys.default || Deno.env.get("SUPABASE_ANON_KEY")!,
      secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    ),
    ...providerConfig((name) => Deno.env.get(name)),
  }),
);
