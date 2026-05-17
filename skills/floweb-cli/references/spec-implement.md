# 实现 Spec

## 流程

1. **通读整个 Spec** — 理解问题、方案、Goals、Non-goals、所有 Phase
2. **阅读所有重要文件** — Spec 列出的每个文件 + 外部文档
3. **实现当前 Phase** — 完成所有 task items 和 success criteria
4. **验证** — `pnpm type-check` + `pnpm test` + 确认行为正确
5. **标记完成** — Spec 中 tasks 改为 `- [x]`
6. **不自动 commit** — 展示给用户审核
7. **处理反馈** — 迭代修改
8. **更新 Spec** — 实现偏离原计划时更新 Spec
9. **提出后续工作** — 发现非阻塞改进，记 Future work
10. **进入下一个 Phase** — 当前 Phase 批准并提交后才开始

## 规则

1. 一次只做一个 Phase
2. 每个 Phase 产生用户可见进展
3. Spec 有误或不完整 → 暂停和用户讨论
4. 每个 Phase 后 type-check 和 tests 必须通过
5. 只写满足 Phase success criteria 的代码
