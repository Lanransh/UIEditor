# 处理 Rebase 冲突

只在 `git rebase <target>` 发生冲突时读取并执行本流程。

1. 在一次调用中运行 `git status --short` 和
   `git diff --name-only --diff-filter=U`，确认当前冲突范围。
2. 逐个读取冲突文件、相关 commit 和 stage 1/2/3 内容，理解共同基线、当前目标
   分支与正在重放的 feature 改动。rebase 期间 `ours` 指目标分支一侧，`theirs`
   指正在重放的 feature commit；不要凭名称猜测。
3. 做语义合并，同时保留目标分支的新变化和 feature 的意图。不要对全部冲突统一
   选择 `ours` 或 `theirs`，不要遗留冲突标记，不要使用 `git rebase --skip`。
   优先从已合并的源文件重新生成生成文件；不要猜测无法可靠重建的二进制冲突。
4. 对已解决文件运行 `git diff --check` 并检查没有冲突标记，显式暂存后运行
   `git rebase --continue`。后续 commit 再次冲突时重复本流程；不要在每个冲突
   commit 后重复整套自动化验证。
5. 只有无法从代码、测试、文档和 commit 意图可靠判断正确结果时，才运行
   `git rebase --abort`。确认当前分支和 HEAD 已恢复到 rebase 前记录的 feature，
   报告具体歧义并停止；不要为了完成 rebase 静默丢弃任一侧改动。
