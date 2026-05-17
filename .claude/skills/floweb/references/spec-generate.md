# 生成 Spec

## 流程

1. **深入理解现有代码** — 读所有相关源文件，理解当前架构。用代码搜索找到相关模式和调用点。理解完再设计。
2. **研究外部文档** — 涉及第三方库/API 时查官方文档，遵循最佳实践。
3. **提出关键问题** — 方案不明确时向用户提出具体设计选项，附 trade-off 分析。不要猜。
4. **建立 Goals 和 Non-goals** — Goals 是可验证的功能目标，Non-goals 明确排除范围（默认包含"不做迁移和回填"）。
5. **设计 Phase** — 每个 Phase commit 大小（< 100 行）、有 success criteria、产生用户可见进展。不写纯重构、纯搭架子、提前抽象的 Phase。

## Spec 格式

```markdown
## Problem overview
[一段话描述问题]

## Solution overview
[一段话描述方案]

## Goals
- [ ] 目标 1：用户可以……
- [ ] 目标 2：系统提供……

## Non-goals
- 不做什么……

## Important files/docs
- `src/path/to/file.ts`

## Implementation

### Phase 1: [标题]
Success criteria:
- [ ] 任务 1
- [ ] 任务 2
```

## 规则

1. 选最简单的方案完成端到端价值
2. 不做"万一以后要"的配置项
3. 等有第二个具体用例再引入抽象
4. 测最可能出错的东西，不测最可能正确的东西
5. Phase 没有清晰可验证标准 → 重新设计
