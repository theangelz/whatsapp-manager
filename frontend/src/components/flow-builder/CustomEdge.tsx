import { memo } from 'react'
import {
  EdgeProps,
  getSmoothStepPath,
  EdgeLabelRenderer,
  BaseEdge,
} from 'reactflow'
import { X } from 'lucide-react'

function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
  })

  const onEdgeClick = (evt: React.MouseEvent) => {
    evt.stopPropagation()
    // Dispatch custom event to delete this edge
    window.dispatchEvent(new CustomEvent('deleteEdge', { detail: { id } }))
  }

  return (
    <>
      {/* Shadow/glow effect for selected edges */}
      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke="#a855f7"
          strokeWidth={6}
          strokeOpacity={0.3}
          style={{ filter: 'blur(4px)' }}
        />
      )}

      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected ? '#a855f7' : '#8b5cf6',
          strokeWidth: selected ? 2.5 : 2,
          strokeDasharray: '8 4',
          strokeLinecap: 'round',
        }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            onClick={onEdgeClick}
            className="
              w-5 h-5
              bg-white dark:bg-zinc-800
              border-2 border-red-400
              hover:bg-red-500 hover:border-red-500
              rounded-full
              flex items-center justify-center
              text-red-500 hover:text-white
              shadow-lg
              transition-all duration-200
              hover:scale-110
              active:scale-95
              opacity-70 hover:opacity-100
            "
            title="Remover conexao"
          >
            <X className="w-3 h-3" strokeWidth={3} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export default memo(CustomEdge)
