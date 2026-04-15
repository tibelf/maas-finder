

# 增量同步 + 每周定时任务

## 方案

配置项（`min_stars` 等）直接作为代码常量写在 Edge Function 里，不建配置表。`last_synced_date` 从数据库现有数据推算。

## 实现步骤

### 1. 修改 Edge Function `supabase/functions/sync-github-projects/index.ts`

- **去掉 delete 逻辑**（第177-178行的全表删除）
- **推算上次同步时间**：查询 `github_projects` 表中 `max(last_synced_at)`，如果为空则用 `2020-01-01`
- **GitHub 搜索加时间过滤**：`created:>{last_synced_date} stars:>=500`，一轮搜索
- **保留 upsert**：已有项目更新 stars/forks/score，新项目插入
- **增加搜索关键词**：加入 `ai gateway`、`llm proxy`、`llm router`
- 常量 `MIN_STARS = 500` 写在代码顶部

### 2. 数据库迁移：启用 pg_cron + pg_net，创建每周定时任务

```sql
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'weekly-github-sync',
  '0 3 * * 1',  -- 每周一凌晨3点
  $$ select net.http_post(
    url := 'https://eemgaeakxafyciyqcnbp.supabase.co/functions/v1/sync-github-projects',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'::jsonb,
    body := '{}'::jsonb
  ) as request_id; $$
);
```

## 涉及文件

| 文件 | 变更 |
|------|------|
| `supabase/functions/sync-github-projects/index.ts` | 去掉 delete，加 `created:>` 过滤，增加关键词，常量 `MIN_STARS` |
| 数据库迁移 | 启用 pg_cron/pg_net + 每周一定时任务 |

