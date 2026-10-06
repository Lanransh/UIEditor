---
name: integrate-feature-branch
description: 将当前本地 feature 分支 rebase 到目标主分支，主动解决冲突，以 fast-forward 方式完成本地合并并安全删除 feature 分支。用户未指定目标分支时使用仓库的默认分支。仅当用户显式调用 `$integrate-feature-branch` 并要求集成已测试通过的 feature 时使用；不得隐式触发。
---

# 集成 Feature 分支

把当前已测试通过的 feature 分支集成到本地目标主分支。重点是完成分支合并，
不要读取、比较、记录或汇报提交 ID，也不要运行构建或测试验证。

## 核心原则

- 开始前读取仓库根目录 `AGENTS.md`。
- 仅在用户显式调用本 skill 时执行。调用即表示当前 feature 已测试通过，不再询问
  是否测试，也不运行构建、测试或其他功能验证。
- 除读取 `AGENTS.md` 外，首先确认当前 checkout 不是 Codex-managed linked
  worktree。若仍是 linked worktree，提醒用户先把任务移交到仓库主 checkout，
  然后停止。
- 用户指定目标分支时使用该本地分支；否则从本地保存的远端默认分支符号引用解析。
  优先使用 `refs/remotes/origin/HEAD`；没有时，仅在 `refs/remotes/*/HEAD` 唯一指向
  同一个本地分支名时使用该分支。无法确定时询问用户。
- 不 fetch、不 pull、不 push，不操作远程分支。
- 不创建 merge commit，不使用 `reset`、`git branch -D` 或其他可能丢失改动的命令。
- 合并失败时保留 feature 分支和现有工作区，报告失败原因后停止。

## 1. 确认分支和工作区

尽量在一次只读工具调用中完成以下检查：

1. 使用 `git rev-parse --show-toplevel`、
   `git rev-parse --path-format=absolute --git-dir --git-common-dir` 和
   `git worktree list --porcelain` 判断当前 checkout 是否为 linked worktree。
2. 使用 `git branch --show-current` 获取当前 feature 分支。若处于 detached HEAD、
   当前分支就是目标分支，或目标分支正被其他 worktree 检出，则停止并说明原因。
3. 使用 `git check-ref-format --branch <target>` 校验目标分支名，并确认
   `refs/heads/<target>` 是已存在的本地分支。
4. 使用 `git status --porcelain=v1 --untracked-files=all` 检查工作区。

工作区不干净时：

- 确认不存在未解决的合并条目。
- 检查已暂存、未暂存和未跟踪文件；发现明显密钥、构建产物、超大文件或与当前
  feature 无关的改动时，停止并询问用户。
- 对确认属于当前 feature 的改动，只按显式文件路径执行 `git add -A -- <paths...>`，
  再运行 `git diff --cached --check` 和 `git diff --cached --stat`。
- 根据改动生成简洁提交信息并执行 `git commit`。不跳过 hooks，不 amend 既有提交。
- 提交后确认工作区干净，但不要读取或汇报提交 ID。

## 2. Rebase

1. 运行 `git rebase <target>`。
2. 若发生冲突，完整读取并严格执行
   [rebase-conflicts.md](references/rebase-conflicts.md)；无冲突时不要读取该文件。
3. 冲突解决后只确认 rebase 已结束且工作区干净，不运行构建或测试验证，也不检查
   提交关系或提交 ID。

## 3. 合并并清理

1. 运行 `git switch <target>`。
2. 运行 `git merge --ff-only <feature>`。失败时保留 feature 分支，不改用普通 merge。
3. 合并成功后运行 `git branch -d <feature>`。若安全删除被拒绝，保留分支并报告；
   永不使用 `-D`。
4. 最后使用 `git branch --show-current`、`git status --porcelain=v1` 和本地分支列表
   确认当前位于目标分支、工作区干净，并确认 feature 是否已删除。

## 结果汇报

只报告：

- feature 分支和目标分支名称；
- 是否创建了工作区提交；
- 是否发生冲突及处理结果；
- fast-forward 合并是否成功；
- 本地 feature 分支是否已安全删除。

不要报告任何提交 ID，也不要运行或汇报构建与测试验证。
