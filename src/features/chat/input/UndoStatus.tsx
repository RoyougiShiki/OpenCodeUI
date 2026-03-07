import { RedoIcon } from '../../../components/Icons'

interface UndoStatusProps {
  canRedo: boolean
  revertSteps: number
  onRedo?: () => void
  onRedoAll?: () => void
}

export function UndoStatus({ canRedo, revertSteps, onRedo, onRedoAll }: UndoStatusProps) {
  return (
    <div
      className="inline-flex flex-col justify-center"
      style={{
        overflow: 'hidden',
        transition: 'max-height 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease-out',
        maxHeight: canRedo ? '32px' : '0px',
        opacity: canRedo ? 1 : 0,
      }}
    >
      <div className="flex items-center justify-center">
        <div
          style={{
            transition: 'transform 200ms cubic-bezier(0.34, 1.2, 0.64, 1)',
            transform: canRedo ? 'scale(1)' : 'scale(0.95)',
          }}
          className="flex items-center gap-2 px-3 h-[32px] box-border bg-accent-main-100/10 backdrop-blur-md border border-accent-main-100/20 rounded-full"
        >
          <div className="w-1.5 h-1.5 bg-accent-main-100 rounded-full animate-pulse" />
          <span className="text-[11px] text-accent-main-000 whitespace-nowrap">
            Editing{revertSteps > 1 ? ` (${revertSteps})` : ''}
          </span>
          <button
            onClick={onRedo}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-accent-main-000 hover:bg-accent-main-100/20 rounded-md transition-colors"
          >
            <RedoIcon size={12} />
            <span>Redo</span>
          </button>
          {revertSteps > 1 && (
            <button
              onClick={onRedoAll}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-accent-main-000 hover:bg-accent-main-100/20 rounded-md transition-colors"
            >
              <span>Redo All</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
