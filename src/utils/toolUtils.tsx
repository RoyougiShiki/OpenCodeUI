/**
 * Tool Utilities
 *
 * 这个文件现在只是重新导出 features/message/tools 模块的内容
 * 保持向后兼容性
 */

// Re-export icons
export {
  FileReadIcon,
  FileWriteIcon,
  TerminalIcon,
  SearchIcon,
  GlobeIcon,
  BrainIcon,
  WrenchIcon,
  ChecklistIcon,
  QuestionIcon,
  TaskIcon,
} from '../features/message/tools/icons'

// Re-export registry functions
export { getToolIcon } from '../features/message/tools/registry'

/**
 * Format tool name to Title Case
 * e.g. "read_file" -> "Read File", "web-search" -> "Web Search"
 */
export function formatToolName(name: string): string {
  if (!name) return 'Tool'
  return name
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
