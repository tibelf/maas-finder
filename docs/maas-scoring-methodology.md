# MaaS 项目准入体系 — 方法论演进说明

## 一、背景

本项目的目标是从 GitHub 上自动发现适合接入七牛 MaaS 的开源项目。早期版本（`maas-integration-hub` v1/v2/v3）采用基于证据累积的评分思路：收集 README 关键词、依赖包、GitHub topics 等信号，加权求和，超过阈值则判定为可接入目标。

本文记录了对该思路的一次根本性反思，以及由此引出的新方向。`maas-finder` 是在此新方法论上重建的项目，旧项目 `maas-integration-hub` 不再维护。

## 二、旧方法的核心缺陷

旧方法本质上是在回答：**这个项目是否与 LLM 多提供商相关？**

但这不是我们真正需要回答的问题。我们需要回答的是：**七牛 MaaS 能否作为一个具名 provider 被加入这个项目？**

两者之间存在系统性的鸿沟。典型反例：

**Skyvern**：README 列出了 OpenAI、Anthropic、Azure 等，看起来是强信号。但实际上它的接入方式是 `via liteLLM`——liteLLM 提供了"支持任何 OpenAI-compatible endpoint"的通配层。七牛即便接入，也是接入 liteLLM，而不是 Skyvern 本身。

**DeepTutor**：通过 `LLM_HOST`、`LLM_MODEL` 这样的抽象环境变量控制模型，用 "etc." 泛指所有支持的 provider。项目文档不会逐一列举 provider，我们也无法合理地在其中加入七牛。

**superset（Agent Harness）**：README 中出现了 Claude、Gemini 等名字，但集成的是 Claude Code、Codex 等 agent 运行时工具，而不是底层模型 API。

这些项目在旧规则下都能拿到高分，但实际上均不可接入。

## 三、新方法：竞品溯源规则

### 核心逻辑

如果项目中出现了 SiliconFlow、DashScope、Moonshot 等竞品的名称，说明：

1. 项目维护了一个 provider 注册表（否则无法具名集成竞品）
2. 项目不排斥非 OpenAI/Anthropic 头部之外的 provider（竞品能进，七牛也能进）

这一规则将问题从"证明能进"转变为"找到已经进去的同类"，完全绕过了 liteLLM 通配、抽象环境变量、Agent Harness 等所有歧义场景。

### 竞品列表（17 个关键词 / 14 个品牌）

**国内 MaaS**（判别力最强）：

| 关键词 | 对应厂商 |
| --- | --- |
| `siliconflow` | 硅基流动 |
| `dashscope` | 阿里云百炼 |
| `qianfan` | 百度千帆 |
| `zhipuai` / `zhipu` | 智谱 AI |
| `minimax` | MiniMax |
| `moonshot` | 月之暗面 / Kimi |
| `volcengine` | 字节跳动火山引擎 |
| `lingyiwanwu` | 零一万物 |
| `baichuan` | 百川智能 |

**国际 tier-2**（出现说明项目接受非头部 provider）：

| 关键词 | 对应厂商 |
| --- | --- |
| `togetherai` / `together.ai` | Together AI |
| `fireworks ai` / `fireworks.ai` | Fireworks AI |
| `openrouter` | OpenRouter |
| `deepinfra` | DeepInfra |
| `novita` | Novita AI |

**已剔除的候选词**：

- `ark`：字节火山引擎模型服务代号，但与 markdown、benchmark 等大量重叠，噪声极高
- `spark`：讯飞星火，与 Apache Spark、emoji（`:sparkling_heart:`）混淆
- `perplexity`：Perplexity AI，但同时是 NLP 度量值、search 场景类比（"perplexity-style"）、压缩算法对比指标，语义过于多义
- `together ai`（空格版）：在 liteLLM 文档链接中大量误匹配
- `anyscale`：仅出现在代码注释中
- `bigmodel`：Claude Code 教程噪声过多

## 四、补丁：要求至少匹配 2 个竞品

在小规模验证时，单次命中（hit_count = 1）的项目精准率只有约 74%，主要误命中来自以下三类：

1. **一方产品型**：厂商自家 SDK / agent，唯一集成的就是自家云（例如 `QwenLM/Qwen-Agent` 只有 `dashscope`）。
2. **router/gateway infra 型**：项目本身是路由层，竞品只在对比表格中出现（例如 `BlockRunAI/ClawRouter` 的 `openrouter`）。
3. **文档 / 代码注释型**：竞品仅出现在注释或外部链接中，并非真正集成（例如 `lm-sys/RouteLLM` 的 `togetherai` 来自 liteLLM 文档链接）。

这三类误命中的共同特征是**只会命中一个竞品名**——真正维护多 provider 注册表的项目几乎必然同时命中两个及以上竞品（典型如 `one-api` 命中 8 个、`aichat` 命中 5 个、`pydantic-ai` 命中 2 个）。

因此新增补丁：**要求 `distinct_brands.length >= 2` 才判定为可接入目标**。其中品牌去重规则将 `zhipuai` 与 `zhipu` 视为同一品牌、`togetherai` 与 `together.ai` 视为同一品牌、`fireworks ai` 与 `fireworks.ai` 视为同一品牌，以防止同一品牌多个拼写被重复计数。

在 276 条 ground truth 上验证：

| 指标 | 单次命中规则 | ≥2 命中规则 |
| --- | --- | --- |
| 命中总数 | 31 | ~12 |
| 真正例 | 23 | ~11 |
| 误命中 | 8 | ~1 |
| 精准率 | 74.2% | ~92% |
| 召回率 | ~22% | ~10% |

召回率下降是预期的：我们放弃了部分真正例以换取极高精准率。这与目标场景一致——我们需要的是高质量的具名接入目标，而不是一个大而全的候选池；漏掉的项目可以通过运营/销售线索侧补回。

## 五、补丁：排除已集成七牛的项目

竞品溯源规则的目标是找到**潜在**的接入目标。如果一个项目已经在 README 或代码中提到了七牛（`qiniu` / `七牛`），说明集成工作已经完成，不应再出现在待接入候选池里。

因此新增排除规则：扫描同一份文本（description + topics + README + 依赖文件），若发现任意 Qiniu 关键词，直接跳过该项目。此规则在竞品命中检查通过之后执行，防止重复计工。

响应中新增 `qiniu_already_skipped` 计数字段，可用于运营侧追踪已集成项目的增量。

## 六、结论

用「竞品溯源 + ≥2 命中 + 排除已集成七牛」规则替代原有的多信号评分体系，作为准入判别的唯一主轨道：

- 规则简单、可解释：两个及以上竞品出现 = 有注册表 + 接受非头部 provider + 非一方/非 router 噪声
- 精准率约 92%，误命中模式进一步被压缩
- 完全绕过旧方法的系统性歧义（liteLLM 通配、抽象 env var、Agent Harness）
- 已集成七牛的项目自动排除，候选池始终是净增量目标

`maas-finder` 项目的 `sync-github-projects` Edge Function 是此方法论的唯一实现，`maas-integration-hub` 不再维护。
