-- ============================================================
-- استبيان «الارتباط الوظيفي وفاعلية بيئة العمل»
-- وزارة الموارد البشرية والتنمية الاجتماعية
-- سكربت إنشاء قاعدة البيانات في Supabase
-- ============================================================
-- تعليمات التشغيل:
-- 1. افتح مشروعك في Supabase Dashboard
-- 2. اذهب إلى: SQL Editor
-- 3. الصق هذا السكربت بالكامل واضغط Run
-- ============================================================

-- ============================================================
-- جدول ردود الاستبيان
-- ============================================================
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- بيانات عامة
  organization     text not null,   -- الإدارة / جهة العمل (إلزامي)
  job_title        text,            -- المسمى الوظيفي (اختياري)
  years_experience text,            -- سنوات الخبرة (اختياري)

  -- أولًا: الارتباط الوظيفي (5 عبارات، مقياس 1..5)
  eng_1 smallint not null check (eng_1 between 1 and 5),
  eng_2 smallint not null check (eng_2 between 1 and 5),
  eng_3 smallint not null check (eng_3 between 1 and 5),
  eng_4 smallint not null check (eng_4 between 1 and 5),
  eng_5 smallint not null check (eng_5 between 1 and 5),

  -- ثانيًا: بيئة العمل (6 عبارات، مقياس 1..5)
  env_1 smallint not null check (env_1 between 1 and 5),
  env_2 smallint not null check (env_2 between 1 and 5),
  env_3 smallint not null check (env_3 between 1 and 5),
  env_4 smallint not null check (env_4 between 1 and 5),
  env_5 smallint not null check (env_5 between 1 and 5),
  env_6 smallint not null check (env_6 between 1 and 5),

  -- ثالثًا: الأثر والتحسين (4 عبارات، مقياس 1..5)
  imp_1 smallint not null check (imp_1 between 1 and 5),
  imp_2 smallint not null check (imp_2 between 1 and 5),
  imp_3 smallint not null check (imp_3 between 1 and 5),
  imp_4 smallint not null check (imp_4 between 1 and 5),

  -- أسئلة مفتوحة (اختيارية)
  positive_point          text,   -- أبرز نقطة إيجابية في بيئة العمل
  improvement_opportunity text    -- أهم فرصة تحسين مقترحة
);

-- فهارس لتسريع لوحة الإدارة
create index if not exists survey_responses_created_at_idx
  on public.survey_responses (created_at desc);
create index if not exists survey_responses_org_idx
  on public.survey_responses (organization);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table public.survey_responses enable row level security;

-- قراءة الردود متاحة للمستخدمين المصادَق عليهم فقط (لوحة الإدارة)
drop policy if exists "authenticated_select_survey" on public.survey_responses;
create policy "authenticated_select_survey"
  on public.survey_responses
  for select
  to authenticated
  using (true);

-- لا يوجد إدراج/تعديل/حذف مباشر للمجهولين.
-- الإدراج يتم حصراً عبر دالة submit_survey_response (SECURITY DEFINER) أدناه.

-- ============================================================
-- دالة الإرسال الآمنة
-- تتجاوز RLS عبر SECURITY DEFINER وتتحقق من صحة المدخلات
-- ============================================================
create or replace function public.submit_survey_response(
  p_organization            text,
  p_job_title               text       default null,
  p_years_experience        text       default null,
  p_eng                     integer[]  default '{}',   -- 5 تقييمات
  p_env                     integer[]  default '{}',   -- 6 تقييمات
  p_imp                     integer[]  default '{}',   -- 4 تقييمات
  p_positive_point          text       default null,
  p_improvement_opportunity text       default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v integer;
begin
  -- تحقق من البيانات العامة
  if p_organization is null or length(trim(p_organization)) = 0 then
    raise exception 'organization is required' using errcode = '22023';
  end if;
  if length(p_organization)                         > 200  then raise exception 'organization too long'    using errcode = '22001'; end if;
  if length(coalesce(p_job_title,''))               > 200  then raise exception 'job_title too long'        using errcode = '22001'; end if;
  if length(coalesce(p_years_experience,''))        > 100  then raise exception 'years_experience too long' using errcode = '22001'; end if;
  if length(coalesce(p_positive_point,''))          > 2000 then raise exception 'positive_point too long'   using errcode = '22001'; end if;
  if length(coalesce(p_improvement_opportunity,'')) > 2000 then raise exception 'improvement too long'      using errcode = '22001'; end if;

  -- تحقق من اكتمال عدد التقييمات في كل قسم
  if array_length(p_eng, 1) is distinct from 5 then raise exception 'engagement section requires 5 ratings'  using errcode = '22023'; end if;
  if array_length(p_env, 1) is distinct from 6 then raise exception 'environment section requires 6 ratings' using errcode = '22023'; end if;
  if array_length(p_imp, 1) is distinct from 4 then raise exception 'impact section requires 4 ratings'      using errcode = '22023'; end if;

  -- تحقق من أن كل تقييم بين 1 و 5
  foreach v in array (p_eng || p_env || p_imp) loop
    if v is null or v < 1 or v > 5 then
      raise exception 'rating values must be between 1 and 5' using errcode = '22023';
    end if;
  end loop;

  insert into public.survey_responses (
    organization, job_title, years_experience,
    eng_1, eng_2, eng_3, eng_4, eng_5,
    env_1, env_2, env_3, env_4, env_5, env_6,
    imp_1, imp_2, imp_3, imp_4,
    positive_point, improvement_opportunity
  ) values (
    trim(p_organization),
    nullif(trim(coalesce(p_job_title,'')), ''),
    nullif(trim(coalesce(p_years_experience,'')), ''),
    p_eng[1], p_eng[2], p_eng[3], p_eng[4], p_eng[5],
    p_env[1], p_env[2], p_env[3], p_env[4], p_env[5], p_env[6],
    p_imp[1], p_imp[2], p_imp[3], p_imp[4],
    nullif(trim(coalesce(p_positive_point,'')), ''),
    nullif(trim(coalesce(p_improvement_opportunity,'')), '')
  );
end;
$$;

grant execute on function public.submit_survey_response(text, text, text, integer[], integer[], integer[], text, text)
  to anon, authenticated;

-- ============================================================
-- عدّاد زوّار الموقع
-- ============================================================
create table if not exists public.site_stats (
  key        text primary key,
  value      bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.site_stats enable row level security;

drop policy if exists "anon_select_site_stats" on public.site_stats;
create policy "anon_select_site_stats"
  on public.site_stats
  for select
  to anon, authenticated
  using (true);

create or replace function public.increment_visitor_count()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_value bigint;
begin
  update public.site_stats
     set value = value + 1,
         updated_at = now()
   where key = 'visitors'
  returning value into new_value;

  if new_value is null then
    insert into public.site_stats (key, value)
    values ('visitors', 1)
    returning value into new_value;
  end if;

  return new_value;
end;
$$;

grant execute on function public.increment_visitor_count() to anon, authenticated;
