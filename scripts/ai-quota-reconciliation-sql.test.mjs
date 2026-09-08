// @vitest-environment node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const runtime = new URL("../.qa/extension-sql/node_modules/@electric-sql/pglite/dist/index.js", import.meta.url);
const migrationFile = new URL("../supabase/migrations/20260908073828_ai_usage_reconciliation.sql", import.meta.url);
const oldFile = new URL("../supabase/migrations/20260905163653_server_managed_ai_usage.sql", import.meta.url);
const user = "11111111-1111-4111-8111-111111111111";
const otherUser = "22222222-2222-4222-8222-222222222222";
let db;

async function fixture(kind = "resume_optimization", owner = user) {
  const { rows: [task] } = await db.query(`select public.reserve_ai_usage_server($1,$2,gen_random_uuid(),'fingerprint',true) as data`, [owner,kind]);
  const { rows: [run] } = await db.query(`insert into public.ai_runs(user_id,kind,status,input_fingerprint) values($1,$2,'running','fingerprint') returning id`, [owner,kind === "resume_optimization" ? "job_match" : "interview_prep"]);
  await db.query(`select public.bind_ai_usage_run_server($1,$2,$3)`, [owner,task.data.taskId,run.id]);
  return { task: task.data.taskId, run: run.id, owner };
}
async function saved(item, kind = "resume_optimization") {
  let output;
  if (kind === "resume_optimization") {
    const { rows: [resume] } = await db.query(`insert into public.resumes(user_id) values($1) returning id`, [item.owner]);
    output = { score: 80, matchedKeywords: [], missingKeywords: [], risks: [], suggestions: [], context: { resumeId: resume.id } };
  } else {
    const result = { summary: "test", roleSignals: ["one", "two", "three"], questions: Array.from({ length: 6 }, () => ({ question: "test" })), riskWarnings: [], preparationChecklist: [] };
    const { rows: [prep] } = await db.query(`insert into public.interview_preparations(user_id,result,resume_storage_path) values($1,$2,'synthetic/file.docx') returning id`, [item.owner,JSON.stringify(result)]);
    output = { preparationId: prep.id };
  }
  await db.query(`update public.ai_runs set status='completed',output=$2 where id=$1`, [item.run,JSON.stringify(output)]);
  return output;
}
async function status(item) {
  return (await db.query(`select status,execution_run_id,result_run_id,quota_date::text from public.ai_usage_tasks where id=$1`, [item.task])).rows[0];
}
async function reconcile(owner = null, limit = 50) {
  return (await db.query(`select public.reconcile_ai_usage_server($1,$2) as data`, [owner,limit])).rows[0].data;
}

describe.skipIf(!existsSync(runtime))("AI quota reconciliation PostgreSQL contracts", () => {
  beforeEach(async () => {
    const { PGlite } = await import(runtime.href);
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema private;
      create table public.profiles(id uuid primary key,ai_daily_limit integer not null default 20);
      create table public.ai_runs(id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles on delete cascade,kind text,status text,input_fingerprint text,output jsonb,created_at timestamptz not null default now());
      create table public.resumes(id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles on delete cascade);
      create table public.interview_preparations(id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles on delete cascade,result jsonb,resume_storage_path text);
      create table public.ai_usage_tasks(id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles on delete cascade,kind text,status text default 'reserved',operation_key uuid,input_fingerprint text,quota_date date,result_run_id uuid references public.ai_runs on delete set null,created_at timestamptz default now(),updated_at timestamptz default now(),unique(user_id,operation_key));
      alter table public.ai_usage_tasks enable row level security;
      grant usage on schema public,private to service_role;
      grant all on all tables in schema public to service_role;
      insert into public.profiles(id) values('${user}'),('${otherUser}');
    `);
    await db.exec(await readFile(oldFile,"utf8"));
    await db.exec(await readFile(migrationFile,"utf8"));
  }, 20000);
  afterEach(async () => { await db?.close(); });

  it("migration is repeatable and never broadens authenticated RPC access", async () => {
    await db.exec(await readFile(migrationFile,"utf8"));
    for (const role of ["anon","authenticated"]) {
      for (const name of ["bind_ai_usage_run_server(uuid,uuid,uuid)","reconcile_ai_usage_server(uuid,integer)","complete_ai_usage_server(uuid,uuid,uuid)"]) {
        const { rows: [row] } = await db.query(`select has_function_privilege($1,$2,'execute') as allowed`, [role,`public.${name}`]);
        expect(row.allowed).toBe(false);
      }
    }
    expect((await db.query(`select has_function_privilege('service_role','public.reconcile_ai_usage_server(uuid,integer)','execute') as allowed`)).rows[0].allowed).toBe(true);
  });
  it("runs the exact remote DML smoke fixture and rolls synthetic accounts and tasks back", async () => {
    // Only the local harness needs a minimal Auth trigger/extra required columns.
    // The remote fixture itself performs no schema changes.
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      alter table public.profiles add column is_admin boolean not null default false;
      alter table public.ai_runs add column provider text;
      alter table public.resumes add column name text,add column storage_path text,
        add column mime_type text,add column size_bytes bigint,add column parsed_text text,add column parse_status text;
      create function private.fixture_new_user() returns trigger language plpgsql as $$
        begin insert into public.profiles(id) values(new.id); return new; end; $$;
      create trigger fixture_new_user after insert on auth.users for each row execute function private.fixture_new_user();
    `);
    const sql = await readFile(new URL("../supabase/tests/ai_usage_reconciliation.sql",import.meta.url),"utf8");
    expect(sql).not.toMatch(/(?:create|alter|drop)\s+(?:table|function|schema|trigger|index)/i);
    const result = await db.exec(sql);
    expect(result.flatMap(item => item.rows).some(row => row.result?.startsWith("passed: exact binding"))).toBe(true);
    expect(result.at(-1).rows[0]).toEqual({ remaining_auth_users: 0,remaining_usage_tasks: 0 });
  });
  it("requires an exact owner, kind, fingerprint and active lease at bind time", async () => {
    const item = await fixture();
    await expect(db.query(`select public.bind_ai_usage_run_server($1,$2,$3)`, [otherUser,item.task,item.run])).rejects.toThrow();
    const { rows: [different] } = await db.query(`insert into public.ai_runs(user_id,kind,status,input_fingerprint) values($1,'job_match','running','fingerprint') returning id`, [user]);
    await expect(db.query(`select public.bind_ai_usage_run_server($1,$2,$3)`, [user,item.task,different.id])).rejects.toThrow(/already bound/);
    await db.query(`update public.ai_usage_tasks set created_at=now()-interval '31 minutes' where id=$1`, [item.task]);
    await expect(db.query(`select public.bind_ai_usage_run_server($1,$2,$3)`, [user,item.task,item.run])).rejects.toThrow(/active execution/);
  });
  it("recovers a saved result exactly once without creating usage rows or changing outputs", async () => {
    const item = await fixture();
    const output = await saved(item);
    expect((await reconcile()).completed).toBe(1);
    expect((await reconcile()).completed).toBe(0);
    await db.query(`select public.complete_ai_usage_server($1,$2,$3)`, [user,item.task,item.run]);
    expect(await status(item)).toMatchObject({ status: "completed", result_run_id: item.run });
    expect((await db.query(`select count(*)::int as count from public.ai_usage_tasks`)).rows[0].count).toBe(1);
    expect((await db.query(`select output from public.ai_runs where id=$1`, [item.run])).rows[0].output).toEqual(output);
    expect((await db.query(`select private.ai_quota_for_user($1) as data`, [user])).rows[0].data.used).toBe(1);
  });
  it("settles late expired results against their original date, never today's allowance", async () => {
    const item = await fixture();
    await db.query(`update public.ai_usage_tasks set status='expired',created_at=now()-interval '1 day',quota_date=timezone('Asia/Shanghai',now())::date-1 where id=$1`, [item.task]);
    const originalDate = (await status(item)).quota_date;
    await saved(item);
    expect((await reconcile()).completed).toBe(1);
    expect(await status(item)).toMatchObject({ status: "completed", quota_date: originalDate });
    expect((await db.query(`select private.ai_quota_for_user($1) as data`, [user])).rows[0].data.used).toBe(0);
  });
  it("reconciles before reserve, even forceNew cannot double-execute one operation", async () => {
    const item = await fixture();
    await saved(item);
    await db.query(`update public.ai_usage_tasks set created_at=now()-interval '31 minutes' where id=$1`, [item.task]);
    const { rows: [row] } = await db.query(`select public.reserve_ai_usage_server(user_id,kind,operation_key,input_fingerprint,true) as data from public.ai_usage_tasks where id=$1`, [item.task]);
    expect(row.data).toMatchObject({ cached: true, reserved: false, taskId: item.task, resultRunId: item.run });
  });
  it("does not delete or silently reexecute an expired linked task with no result", async () => {
    const item = await fixture();
    await db.query(`update public.ai_usage_tasks set created_at=now()-interval '31 minutes' where id=$1`, [item.task]);
    const { rows: [row] } = await db.query(`select public.reserve_ai_usage_server(user_id,kind,operation_key,input_fingerprint,true) as data from public.ai_usage_tasks where id=$1`, [item.task]);
    expect(row.data).toMatchObject({ cached: false, reserved: false, taskStatus: "expired", taskId: item.task });
    expect((await status(item)).execution_run_id).toBe(item.run);
  });
  it("keeps missing, malformed and wrong-owner artifacts unbilled", async () => {
    const item = await fixture("interview_prep");
    await db.query(`update public.ai_runs set status='completed',output='{"preparationId":"bad"}'::jsonb where id=$1`, [item.run]);
    expect((await reconcile()).completed).toBe(0);
    const output = await saved(item,"interview_prep");
    await db.query(`update public.interview_preparations set user_id=$2 where id::text=$1`, [output.preparationId,otherUser]);
    expect((await reconcile()).completed).toBe(0);
    await db.query(`update public.interview_preparations set user_id=$2 where id::text=$1`, [output.preparationId,user]);
    expect((await reconcile()).completed).toBe(1);
  });
  it("never guesses historic unlinked tasks from the same input fingerprint", async () => {
    const item = await fixture();
    await db.query(`update public.ai_usage_tasks set execution_run_id=null where id=$1`, [item.task]);
    await saved(item);
    expect((await reconcile()).completed).toBe(0);
    expect((await status(item)).status).toBe("reserved");
  });
  it("requires the actual resume artifact and a numeric score before recovering analysis", async () => {
    const item = await fixture();
    const output = await saved(item);
    await db.query(`update public.ai_runs set output=$2 where id=$1`, [item.run, JSON.stringify({ ...output, score: "80" })]);
    expect((await reconcile()).completed).toBe(0);
    await db.query(`update public.ai_runs set output=$2 where id=$1`, [item.run, JSON.stringify(output)]);
    await db.query(`delete from public.resumes`);
    expect((await reconcile()).completed).toBe(0);
    expect((await status(item)).status).toBe("reserved");
  });
  it("permits an exact bind retry but a single run can never bind to two tasks", async () => {
    const item = await fixture();
    await expect(db.query(`select public.bind_ai_usage_run_server($1,$2,$3) as result`, [user,item.task,item.run])).resolves.toMatchObject({ rows: [{ result: true }] });
    const { rows: [second] } = await db.query(`insert into public.ai_usage_tasks(user_id,kind,operation_key,input_fingerprint,quota_date,created_at) select user_id,kind,gen_random_uuid(),input_fingerprint,quota_date,created_at from public.ai_usage_tasks where id=$1 returning id`, [item.task]);
    await expect(db.query(`select public.bind_ai_usage_run_server($1,$2,$3)`, [user,second.id,item.run])).rejects.toThrow(/unique/);
  });
  it("executes maintenance with service_role privileges and keeps deleted users deleted", async () => {
    const item = await fixture();
    await saved(item);
    await db.exec("set role service_role");
    expect((await reconcile()).completed).toBe(1);
    await db.exec("reset role");
    await db.query(`delete from public.profiles where id=$1`, [user]);
    expect((await reconcile()).examined).toBe(0);
    expect((await db.query(`select count(*)::int as count from public.ai_usage_tasks where user_id=$1`, [user])).rows[0].count).toBe(0);
  });
  it("never completes released tasks and releases confirmed failed runs without touching files", async () => {
    const item = await fixture();
    await db.query(`update public.ai_runs set status='failed' where id=$1`, [item.run]);
    expect((await reconcile()).released).toBe(1);
    await saved(item);
    expect((await reconcile()).completed).toBe(0);
    expect((await status(item)).status).toBe("released");
    expect((await db.query(`select count(*)::int as count from public.resumes`)).rows[0].count).toBe(1);
  });
  it("scopes reconciliation to a single account and enforces batch bounds", async () => {
    const first = await fixture();
    const second = await fixture("resume_optimization",otherUser);
    await saved(first); await saved(second);
    expect((await reconcile(user)).completed).toBe(1);
    expect((await status(second)).status).toBe("reserved");
    expect((await reconcile(null,1)).examined).toBe(1);
    for (const limit of [0,101]) await expect(reconcile(null,limit)).rejects.toThrow(/limit/);
  });
  it("does not accept a mismatched completed run through explicit completion", async () => {
    const first = await fixture();
    const second = await fixture("resume_optimization",otherUser);
    await saved(second);
    await expect(db.query(`select public.complete_ai_usage_server($1,$2,$3)`, [user,first.task,second.run])).rejects.toThrow(/bound execution/);
    await saved(first);
    await db.query(`update public.ai_runs set input_fingerprint='wrong' where id=$1`, [first.run]);
    expect((await reconcile()).completed).toBe(1); // only the second account
    expect((await status(first)).status).toBe("reserved");
  });
});

describe("AI reconciliation SQL safety", () => {
  it("uses invoker privileges, existing account locks, bounded batches and no artifact mutations", async () => {
    const sql = await readFile(migrationFile,"utf8");
    expect(sql).not.toMatch(/security\s+definer/i);
    expect(sql).not.toMatch(/(?:update|delete\s+from)\s+public\.(ai_runs|resumes|interview_preparations)/i);
    expect(sql).toContain("pg_try_advisory_xact_lock");
    expect(sql).toContain("order by t.user_id,t.created_at,t.id limit p_limit");
    expect(sql).not.toMatch(/set\s+quota_date\s*=/i);
    const batch = sql.slice(sql.indexOf("create or replace function public.reconcile_ai_usage_server"),sql.indexOf("create or replace function public.complete_ai_usage_server"));
    expect(batch.indexOf("pg_try_advisory_xact_lock")).toBeLessThan(batch.indexOf("for update"));
  });
});
