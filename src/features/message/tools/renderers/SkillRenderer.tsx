import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { ContentBlock } from '../../../../components'
import type { ToolRendererProps } from '../types'

// ============================================
// Skill Renderer - 技能调用渲染器
// 技能名由外层 ToolPartView header 显示（通过 getInputDescription），
// 此处只渲染内容，不使用独立折叠（外层已有折叠能力）
// ============================================

export const SkillRenderer = memo(function SkillRenderer({ part, data }: ToolRendererProps) {
  const { t } = useTranslation('message')
  const { state } = part

  const hasOutput = !!(data.output?.trim() || data.files || data.diff)
  const hasError = !!data.error
  const isActive = state.status === 'running' || state.status === 'pending'

  if (hasError) {
    return (
      <ContentBlock
        label={t('defaultRenderer.skill') || 'Skill'}
        content={data.error || ''}
        variant="error"
        collapsible={false}
      />
    )
  }

  if (hasOutput) {
    return (
      <div className="flex flex-col gap-2">
        {data.files ? (
          data.files.map((file, idx) => (
            <ContentBlock
              key={idx}
              label={file.filePath?.split(/[/\\]/).pop() || t('defaultRenderer.skill') || 'Skill'}
              filePath={file.filePath}
              diff={file.diff || file.patch || (file.before !== undefined && file.after !== undefined ? { before: file.before, after: file.after } : undefined)}
              collapsible={false}
            />
          ))
        ) : data.diff ? (
          <ContentBlock
            label={t('defaultRenderer.skill') || 'Skill'}
            diff={data.diff}
            diffStats={data.diffStats}
            collapsible={false}
          />
        ) : (
          <ContentBlock
            label={t('defaultRenderer.skill') || 'Skill'}
            content={data.output}
            collapsible={false}
          />
        )}
      </div>
    )
  }

  if (isActive) {
    return (
      <ContentBlock
        label={t('defaultRenderer.skill') || 'Skill'}
        isLoading={true}
        loadingText=""
        collapsible={false}
      />
    )
  }

  return null
})
