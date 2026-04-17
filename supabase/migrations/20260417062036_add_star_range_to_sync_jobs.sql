/*
  # 为 sync_jobs 表添加 Star 区间字段

  ## 变更说明

  本次迁移为 sync_jobs 表新增两个字段，用于支持多次初始化任务的 star 区间分段搜索：

  ## 新增字段

  ### sync_jobs 表
  - `max_stars` (integer, nullable) — 本次初始化任务的 star 数上限。NULL 表示首次运行（无上限）。
    每次新建 init 任务时，将上一次完成任务的 min_stars_seen 作为本次的 max_stars，
    从而保证每次初始化覆盖不同的 star 区间，避免重复扫描相同项目。
  - `min_stars_seen` (integer, nullable) — 本次任务实际扫描到的最低 star 数。
    任务运行过程中实时更新，任务完成时该值即为本次全局最低。
    下次初始化时用此值计算新的 max_stars。

  ## 重要说明

  1. 两个字段均可为 NULL，不影响已有任务数据
  2. 不涉及 RLS 策略变更
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sync_jobs' AND column_name = 'max_stars'
  ) THEN
    ALTER TABLE sync_jobs ADD COLUMN max_stars integer DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sync_jobs' AND column_name = 'min_stars_seen'
  ) THEN
    ALTER TABLE sync_jobs ADD COLUMN min_stars_seen integer DEFAULT NULL;
  END IF;
END $$;
