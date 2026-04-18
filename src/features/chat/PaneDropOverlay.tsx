/**
 * PaneDropOverlay — Visual hint for drag-to-split.
 *
 * Shown on top of a ChatPane while a session is being dragged over it.
 * Splits the pane area into 5 zones (top/bottom/left/right/center) with
 * a VS Code style diagonal split + central rectangle.
 *
 * Hit testing:
 * - Center rectangle: inner 40% x 40% of the pane → replace session
 * - Outside: closest edge by normalized distance → split to that side
 */

import { memo } from 'react'
import { useTranslation } from 'react-i18next'

export type DropZone = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface DropPoint {
  /** Normalized mouse X position relative to the pane, 0-1 */
  xRel: number
  /** Normalized mouse Y position relative to the pane, 0-1 */
  yRel: number
}

/** Inner half-size of the central replace zone, normalized */
const CENTER_HALF = 0.2

/**
 * Resolve which drop zone a normalized point falls into.
 */
export function resolveDropZone(point: DropPoint | null): DropZone | null {
  if (!point) return null
  const { xRel, yRel } = point

  if (xRel < 0 || xRel > 1 || yRel < 0 || yRel > 1) return null

  // Center rectangle wins first
  if (Math.abs(xRel - 0.5) < CENTER_HALF && Math.abs(yRel - 0.5) < CENTER_HALF) {
    return 'center'
  }

  // Pick the closest edge by normalized distance
  const dLeft = xRel
  const dRight = 1 - xRel
  const dTop = yRel
  const dBottom = 1 - yRel

  const min = Math.min(dLeft, dRight, dTop, dBottom)
  if (min === dLeft) return 'left'
  if (min === dRight) return 'right'
  if (min === dTop) return 'top'
  return 'bottom'
}

interface PaneDropOverlayProps {
  /** Current active zone; null hides the overlay */
  activeZone: DropZone | null
}

/**
 * Visual overlay. Renders highlight + label for the active zone.
 * Must be placed inside a `position: relative` parent (ChatPane root qualifies).
 */
export const PaneDropOverlay = memo(function PaneDropOverlay({ activeZone }: PaneDropOverlayProps) {
  const { t } = useTranslation('chat')

  if (!activeZone) return null

  const label =
    activeZone === 'center'
      ? t('paneDrop.replace')
      : activeZone === 'top'
        ? t('paneDrop.splitTop')
        : activeZone === 'bottom'
          ? t('paneDrop.splitBottom')
          : activeZone === 'left'
            ? t('paneDrop.splitLeft')
            : t('paneDrop.splitRight')

  // Highlight rectangle covers the area that will receive the new leaf (or the whole pane for replace).
  const highlightStyle: React.CSSProperties = (() => {
    switch (activeZone) {
      case 'center':
        return { left: '20%', top: '20%', width: '60%', height: '60%' }
      case 'left':
        return { left: 0, top: 0, width: '50%', height: '100%' }
      case 'right':
        return { left: '50%', top: 0, width: '50%', height: '100%' }
      case 'top':
        return { left: 0, top: 0, width: '100%', height: '50%' }
      case 'bottom':
        return { left: 0, top: '50%', width: '100%', height: '50%' }
    }
  })()

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Dim the whole pane lightly */}
      <div className="absolute inset-0 bg-bg-000/10" />

      {/* Zone highlight */}
      <div
        className="absolute rounded-md border-2 border-accent-main-100 bg-accent-main-100/15 transition-[left,top,width,height] duration-150 ease-out"
        style={highlightStyle}
      />

      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="px-3 py-1 rounded-md bg-bg-100/90 border border-border-200/60 text-[length:var(--fs-sm)] text-text-100 font-medium shadow-sm">
          {label}
        </span>
      </div>
    </div>
  )
})
