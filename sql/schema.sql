-- ============================================================
-- مبادرة "نلتزم لنرتقي" - حملة "قدوة الانضباط"
-- سكربت إنشاء قاعدة البيانات في Supabase
-- ============================================================
-- تعليمات التشغيل:
-- 1. افتح مشروعك في Supabase Dashboard
-- 2. اذهب إلى: SQL Editor
-- 3. الصق هذا السكربت بالكامل واضغط Run
-- ============================================================

-- جدول الترشيحات
create table if not exists public.nominations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  -- معلومات الجهة
  organization text not null,

  -- ترشيح القائد
  leader_name text not null,
  leader_title text not null,
  leader_reasons text[] not null default '{}',
  leader_other_reason text,

  -- ترشيح الموظفين
  employee_1 text,
  employee_2 text,
  employee_3 text,
  employee_reasons text[] not null default '{}'
);

-- فهرس على تاريخ الإنشاء لترتيب أسرع في لوحة الإدارة
create index if not exists nominations_created_at_idx
  on public.nominations (created_at desc);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

alter table public.nominations enable row level security;

-- حذف السياسات السابقة إن وُجدت (لإعادة التشغيل بأمان)
drop policy if exists "anon_insert_nominations" on public.nominations;
drop policy if exists "authenticated_select_nominations" on public.nominations;

-- سياسة: منع المستخدمين المجهولين من إدراج ترشيحات
-- (انتهت فترة الترشيح — لإعادة فتح الترشيح غيِّر `with check (false)` إلى `with check (true)`)
create policy "anon_insert_nominations"
  on public.nominations
  for insert
  to anon
  with check (false);

-- سياسة: السماح للمستخدمين المصادَق عليهم بقراءة الترشيحات (للوحة الإدارة)
create policy "authenticated_select_nominations"
  on public.nominations
  for select
  to authenticated
  using (true);

-- ============================================================
-- ملاحظة: لا توجد سياسة UPDATE/DELETE للمجهولين أو المصادقين
-- البيانات لا تُعدَّل ولا تُحذف عبر التطبيق - فقط من خلال Dashboard
-- إذا احتجت ذلك لاحقاً، أضف سياسات مناسبة هنا.
-- ============================================================

-- ============================================================
-- إغلاق دالة الترشيح (submit_nomination) — انتهت فترة الترشيح
-- ============================================================
-- ملاحظة: إذا كانت دالة submit_nomination معرَّفة بـ SECURITY DEFINER
-- فإنها تتجاوز سياسات RLS أعلاه. لذلك نسحب صلاحية التنفيذ من anon
-- لضمان عدم قبول أي ترشيحات جديدة عبر RPC.
-- لإعادة فتح الترشيح: امنح الصلاحية مجدداً بـ:
--   grant execute on function public.submit_nomination(...) to anon;
-- ============================================================

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_nomination'
  ) then
    execute (
      select string_agg(
        format('revoke execute on function %s from anon, public;',
               p.oid::regprocedure),
        E'\n'
      )
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'submit_nomination'
    );
  end if;
end$$;
