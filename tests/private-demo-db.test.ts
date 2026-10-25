import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Optional integration test against a disposable LOCAL PostgreSQL database.
// Never accepts a cloud database, production name, or non-loopback address.
const database = process.env.BITO_TEST_DATABASE_URL;
test(
  "private demo database: RLS, atomic quotas, idempotency, revocation and leases",
  { skip: !database },
  async (t) => {
    const url = new URL(database!);
    assert.ok(
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
        /^\/bito_test_[a-z0-9_]+$/.test(url.pathname),
      "Use a disposable local bito_test_* database only",
    );
    const args = [
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "--dbname",
      database!,
    ];
    const sql = (text: string) =>
      execFileSync("psql", args, {
        input: text,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    const asyncSql = async (text: string) =>
      (await promisify(execFile)("psql", [...args, "-c", text])).stdout.trim();
    sql(`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$;
    drop schema if exists public cascade; create schema public; grant usage on schema public to anon,authenticated,service_role;
    create schema if not exists auth; create table if not exists auth.users(id uuid primary key);
    delete from auth.users;`);
    sql(
      readFileSync(
        new URL(
          "../supabase/migrations/202610240001_private_demo.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const a = randomUUID(),
      b = randomUUID(),
      device = randomUUID();
    sql(
      `insert into auth.users(id) values('${a}'),('${b}'); insert into public.demo_members(email) values('a@example.test'),('b@example.test');`,
    );
    assert.equal(
      sql(
        `set role service_role;select public.bito_claim_member('${a}','a@example.test');`,
      ),
      "t",
    );
    assert.equal(
      sql(
        `set role service_role;select public.bito_claim_member('${b}','b@example.test');`,
      ),
      "t",
    );
    const reserve = (
      u: string,
      id = randomUUID(),
      d = device,
      round?: number,
    ) =>
      `select public.bito_reserve('${u}','${d}','${id}','[]'::jsonb,'test',${round ?? "null"});`;
    const finish = (u: string, id: string, status = "complete", round = 1) =>
      `select public.bito_finish('${u}','${device}','${id}',${round},'${status}','[]','[]',5,3);`;
    const reset = () =>
      sql(
        "delete from public.demo_jobs;update public.demo_policy set enabled=true,daily_global=80,daily_user=30,minute_global=8,minute_user=4;",
      );
    await t.test(
      "anonymous and authenticated clients cannot read data or mutate quotas",
      () => {
        assert.throws(
          () =>
            sql("set role authenticated;select * from public.demo_members;"),
          /permission denied/,
        );
        assert.throws(
          () => sql("set role anon;select * from public.demo_jobs;"),
          /permission denied/,
        );
        assert.throws(
          () => sql(`set role authenticated;${reserve(a)}`),
          /permission denied/,
        );
        assert.throws(
          () =>
            sql(
              `set role authenticated;select public.bito_claim_member('${a}','a@example.test');`,
            ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "membership cannot be claimed by a second user and revocation blocks new jobs",
      () => {
        assert.equal(
          sql(
            `set role service_role;select public.bito_claim_member('${b}','a@example.test');`,
          ),
          "f",
        );
        sql(
          `update public.demo_members set active=false where user_id='${a}';`,
        );
        assert.throws(() => sql(reserve(a)), /access_denied/);
        sql(`update public.demo_members set active=true where user_id='${a}';`);
      },
    );
    await t.test(
      "concurrent requests from one account reserve only one active job",
      async () => {
        reset();
        const results = await Promise.allSettled([
          asyncSql(reserve(a)),
          asyncSql(reserve(a)),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(sql("select count(*) from public.demo_usage;"), "1");
      },
    );
    await t.test(
      "revoking a member cancels pending work and removes its stored context",
      () => {
        reset();
        const id = randomUUID();
        sql(reserve(a, id));
        sql(finish(a, id, "waiting"));
        sql(
          `update public.demo_members set active=false where user_id='${a}';`,
        );
        assert.equal(
          sql(
            `select status || ':' || contents::text || ':' || instructions from public.demo_jobs where id='${id}';`,
          ),
          "cancelled:[]:",
        );
        assert.throws(() => sql(reserve(a, id, device, 1)), /access_denied/);
        sql(`update public.demo_members set active=true where user_id='${a}';`);
      },
    );
    await t.test(
      "global daily ceiling cannot be exceeded by simultaneous users",
      async () => {
        reset();
        sql("update public.demo_policy set daily_global=1;");
        const results = await Promise.allSettled([
          asyncSql(reserve(a)),
          asyncSql(reserve(b)),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(sql("select count(*) from public.demo_usage;"), "1");
      },
    );
    await t.test(
      "failed jobs count against quota and repeated request IDs never re-execute",
      () => {
        reset();
        const id = randomUUID();
        sql(reserve(a, id));
        sql(finish(a, id, "error"));
        assert.throws(() => sql(reserve(a, id)), /request_exists/);
        sql("update public.demo_policy set daily_user=1;");
        assert.throws(() => sql(reserve(a)), /daily_limit/);
        assert.equal(
          sql(
            `select contents::text||instructions from public.demo_jobs where id='${id}';`,
          ),
          "[]",
        );
      },
    );
    await t.test(
      "only the owning device can resume a waiting tool job, exactly once per round",
      () => {
        reset();
        const id = randomUUID();
        sql(reserve(a, id));
        sql(finish(a, id, "waiting"));
        assert.throws(
          () => sql(reserve(a, id, randomUUID(), 1)),
          /invalid_job/,
        );
        assert.throws(() => sql(reserve(b, id, device, 1)), /invalid_job/);
        assert.equal(JSON.parse(sql(reserve(a, id, device, 1))).round, 2);
        assert.throws(() => sql(reserve(a, id, device, 1)), /invalid_job/);
        assert.equal(sql("select count(*) from public.demo_usage;"), "2");
      },
    );
    await t.test(
      "cancel and expired leases cannot revive a previous action",
      () => {
        reset();
        const id = randomUUID();
        sql(reserve(a, id));
        sql(`select public.bito_cancel('${a}','${device}','${id}');`);
        assert.equal(sql(finish(a, id)), "f");
        assert.throws(() => sql(reserve(a, id, device, 1)), /invalid_job/);
        const stale = randomUUID();
        sql(reserve(a, stale));
        sql(
          `update public.demo_jobs set lease_until=now()-interval '1 second' where id='${stale}';`,
        );
        sql(reserve(a));
        assert.equal(
          sql(`select status from public.demo_jobs where id='${stale}';`),
          "error",
        );
      },
    );
  },
);
