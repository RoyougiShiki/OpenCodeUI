// ============================================
// Tauri 平台检测 & 工具
// ============================================

/**
 * 检测当前是否运行在 Tauri 环境中
 * 通过检查 window.__TAURI_INTERNALS__ 来判断
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** 文件扩展名 → MIME 类型映射 */
export function extToMime(ext: string): string {
  const map: Record<string, string> = {
    // image
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    // pdf
    pdf: 'application/pdf',
    // audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    // video
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
  }
  return map[ext] || 'application/octet-stream'
}
