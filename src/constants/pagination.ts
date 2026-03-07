// ============================================
// Pagination Constants - 分页相关常量
// ============================================

/** 初始消息加载数量 */
export const INITIAL_MESSAGE_LIMIT = 50

/** 默认页面大小 */
export const DEFAULT_PAGE_SIZE = 20

/** 历史加载批次大小 */
export const HISTORY_LOAD_BATCH_SIZE = 15

/**
 * 单个 session 在内存中的最大消息数
 * 超过此数量会触发裁剪，保留最新的消息
 * 设置为 500 以平衡功能和内存使用
 */
export const MAX_HISTORY_MESSAGES = 500

/** 持久化消息分段写入阈值（字符数） */
export const MESSAGE_PART_PERSIST_THRESHOLD = 20000

/** 可见区域预取缓冲数量 */
export const MESSAGE_PREFETCH_BUFFER = 30

/** 默认搜索结果限制 */
export const DEFAULT_SEARCH_LIMIT = 50

/** Session 列表页面大小 */
export const SESSION_LIST_PAGE_SIZE = 30
