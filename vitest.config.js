import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // agent の worktree (.claude/worktrees/) は古い版のコピーなので拾わない
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
