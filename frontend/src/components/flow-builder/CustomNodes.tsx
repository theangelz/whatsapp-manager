import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  Play,
  MessageSquare,
  Image,
  Mic,
  Video,
  FileText,
  MousePointer,
  List,
  GitBranch,
  Clock,
  Variable,
  Globe,
  PhoneForwarded,
  ArrowRight,
  StopCircle,
  Edit3,
  Trash2,
  Send,
  Database,
  Zap,
  Users,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BaseNodeProps {
  data: {
    label?: string
    content?: string
    buttons?: Array<{ id: string; text: string }>
    listSections?: Array<{ title: string; rows: Array<{ id: string; title: string }> }>
    menuOptions?: Array<{ id: string; trigger: string; label: string }>
    waitForInput?: boolean
    inputVariable?: string
    delay?: number
    variable?: string
    value?: string
    condition?: { variable: string; operator: string; value?: string; cases?: Array<{ id: string; value: string }> }
    mediaUrl?: string
    httpConfig?: { url?: string; method?: string; headers?: Array<{ key: string; value: string }>; body?: string; responseVariable?: string; responseMappings?: Array<{ path: string; variable: string }> }
  }
  selected?: boolean
}

// Modern card styles
const cardStyles = {
  base: 'min-w-[220px] max-w-[280px] bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden transition-all duration-200 hover:shadow-xl',
  selected: 'ring-2 ring-purple-500 ring-offset-2',
  header: 'px-4 py-3 text-white font-semibold text-sm flex items-center gap-2',
  subtitle: 'text-[10px] opacity-80 font-normal',
  body: 'px-4 py-3 text-gray-600 text-xs leading-relaxed',
  footer: 'px-4 py-2 border-t border-gray-50 flex items-center justify-between',
  handle: 'w-3 h-3 !bg-purple-500 border-2 border-white shadow-md',
  handleLabel: 'absolute text-[9px] text-gray-400 whitespace-nowrap',
}

// Gradient backgrounds for different node types
const gradients = {
  start: 'bg-gradient-to-r from-green-500 to-emerald-600',
  message: 'bg-gradient-to-r from-pink-500 to-purple-600',
  media: 'bg-gradient-to-r from-purple-500 to-indigo-600',
  interaction: 'bg-gradient-to-r from-rose-500 to-pink-600',
  data: 'bg-gradient-to-r from-emerald-500 to-teal-600',
  logic: 'bg-gradient-to-r from-amber-500 to-orange-600',
  api: 'bg-gradient-to-r from-blue-500 to-cyan-600',
  transfer: 'bg-gradient-to-r from-gray-500 to-slate-600',
  end: 'bg-gradient-to-r from-red-500 to-rose-600',
}

// Common handles for all 4 sides (input on Top+Left, output on Bottom+Right)
const InputHandles = () => (
  <>
    <Handle type="target" position={Position.Top} id="target-top" className={cardStyles.handle} />
    <Handle type="target" position={Position.Left} id="target-left" className={cardStyles.handle} />
  </>
)

const OutputHandles = () => (
  <>
    <Handle type="source" position={Position.Bottom} id="source-bottom" className={cardStyles.handle} />
    <Handle type="source" position={Position.Right} id="source-right" className={cardStyles.handle} />
  </>
)

// Action buttons component
const ActionButtons = () => (
  <div className="flex items-center gap-1">
    <button className="w-6 h-6 rounded-full bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center transition-colors">
      <Edit3 className="w-3 h-3 text-emerald-600" />
    </button>
    <button className="w-6 h-6 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors">
      <Trash2 className="w-3 h-3 text-red-500" />
    </button>
  </div>
)

// Port label component
const PortLabel = ({ label, position }: { label: string; position: 'left' | 'right' | 'bottom' }) => {
  const positionStyles = {
    left: '-left-16 top-1/2 -translate-y-1/2',
    right: '-right-16 top-1/2 -translate-y-1/2',
    bottom: 'left-1/2 -translate-x-1/2 -bottom-5',
  }
  return (
    <span className={cn(cardStyles.handleLabel, positionStyles[position])}>
      {label}
    </span>
  )
}

// Start Node
export const StartNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <div className={cn(cardStyles.header, gradients.start)}>
      <Play className="w-4 h-4" />
      <div>
        <span>Início do Fluxo</span>
        <div className={cardStyles.subtitle}>Ponto de entrada</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      <p className="text-gray-500 italic">
        {data.label || 'O fluxo começa aqui quando acionado'}
      </p>
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">Trigger</span>
      <Zap className="w-3 h-3 text-green-500" />
    </div>
    <OutputHandles />
  </div>
))
StartNode.displayName = 'StartNode'

// Message Node
export const MessageNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, data.waitForInput ? 'bg-gradient-to-r from-violet-500 to-purple-600' : gradients.message)}>
      <MessageSquare className="w-4 h-4" />
      <div>
        <span>{data.waitForInput ? 'Pergunta' : 'Mensagem'}</span>
        <div className={cardStyles.subtitle}>{data.waitForInput ? 'Aguarda resposta' : 'Enviar texto'}</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      {data.content ? (
        <p className="line-clamp-3">{data.content}</p>
      ) : (
        <p className="italic text-gray-400">Clique para configurar a mensagem...</p>
      )}
      {data.waitForInput && data.inputVariable && (
        <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-violet-50 rounded-lg">
          <Variable className="w-3 h-3 text-violet-500" />
          <span className="text-[10px] text-violet-600 font-mono">{`{{${data.inputVariable}}}`}</span>
        </div>
      )}
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400 flex items-center gap-1">
        <Send className="w-3 h-3" /> {data.waitForInput ? 'Input' : 'Texto'}
      </span>
      <ActionButtons />
    </div>
    <OutputHandles />
  </div>
))
MessageNode.displayName = 'MessageNode'

// Image Node
export const ImageNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, gradients.media)}>
      <Image className="w-4 h-4" />
      <div>
        <span>Imagem</span>
        <div className={cardStyles.subtitle}>Enviar mídia</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      {data.mediaUrl ? (
        <div className="space-y-1">
          <p className="truncate text-xs font-mono bg-gray-50 px-2 py-1 rounded">{data.mediaUrl}</p>
          {data.content && <p className="line-clamp-2">{data.content}</p>}
        </div>
      ) : (
        <p className="italic text-gray-400">Clique para adicionar imagem...</p>
      )}
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">Mídia</span>
      <ActionButtons />
    </div>
    <OutputHandles />
  </div>
))
ImageNode.displayName = 'ImageNode'

// Audio Node
export const AudioNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, gradients.media)}>
      <Mic className="w-4 h-4" />
      <div>
        <span>Áudio</span>
        <div className={cardStyles.subtitle}>Enviar áudio</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      {data.mediaUrl ? (
        <p className="truncate font-mono bg-gray-50 px-2 py-1 rounded">{data.mediaUrl}</p>
      ) : (
        <p className="italic text-gray-400">Clique para adicionar áudio...</p>
      )}
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">Áudio</span>
      <ActionButtons />
    </div>
    <OutputHandles />
  </div>
))
AudioNode.displayName = 'AudioNode'

// Video Node
export const VideoNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, gradients.media)}>
      <Video className="w-4 h-4" />
      <div>
        <span>Vídeo</span>
        <div className={cardStyles.subtitle}>Enviar vídeo</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      {data.mediaUrl ? (
        <div className="space-y-1">
          <p className="truncate font-mono bg-gray-50 px-2 py-1 rounded">{data.mediaUrl}</p>
          {data.content && <p className="line-clamp-2">{data.content}</p>}
        </div>
      ) : (
        <p className="italic text-gray-400">Clique para adicionar vídeo...</p>
      )}
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">Vídeo</span>
      <ActionButtons />
    </div>
    <OutputHandles />
  </div>
))
VideoNode.displayName = 'VideoNode'

// Document Node
export const DocumentNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, gradients.media)}>
      <FileText className="w-4 h-4" />
      <div>
        <span>Documento</span>
        <div className={cardStyles.subtitle}>Enviar arquivo</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      {data.mediaUrl ? (
        <p className="truncate font-mono bg-gray-50 px-2 py-1 rounded">{data.mediaUrl}</p>
      ) : (
        <p className="italic text-gray-400">Clique para adicionar documento...</p>
      )}
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">PDF/Doc</span>
      <ActionButtons />
    </div>
    <OutputHandles />
  </div>
))
DocumentNode.displayName = 'DocumentNode'

// Menu Node - Text-based menu with numbered options
export const MenuNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => {
  const options = data.menuOptions || []

  return (
    <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
      <InputHandles />
      <div className={cn(cardStyles.header, gradients.interaction)}>
        <List className="w-4 h-4" />
        <div>
          <span>Menu de Opções</span>
          <div className={cardStyles.subtitle}>Escolha múltipla</div>
        </div>
      </div>
      <div className={cardStyles.body}>
        {data.content && <p className="mb-2 font-medium text-gray-700">{data.content}</p>}
        {options.length > 0 ? (
          <div className="space-y-1">
            {options.map((opt, i) => (
              <div key={opt.id} className="flex items-center gap-2 px-2 py-1 bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg">
                <span className="w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {opt.trigger}
                </span>
                <span className="text-gray-600">{opt.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="italic text-gray-400">Adicione opções do menu...</p>
        )}
      </div>
      <div className={cardStyles.footer}>
        <span className="text-[10px] text-gray-400">{options.length} opções</span>
        <ActionButtons />
      </div>
      {/* Multiple outputs - one per option + fallback */}
      {options.length > 0 ? (
        <>
          {options.map((opt, i) => (
            <div key={opt.id}>
              <Handle
                type="source"
                position={Position.Bottom}
                id={opt.id}
                className={cardStyles.handle}
                style={{ left: `${((i + 1) / (options.length + 2)) * 100}%` }}
              />
              <span
                className="absolute text-[8px] bg-purple-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none"
                style={{ left: `${((i + 1) / (options.length + 2)) * 100}%`, bottom: -8, transform: 'translate(-50%, 100%)' }}
              >
                {opt.trigger}
              </span>
            </div>
          ))}
          <div>
            <Handle
              type="source"
              position={Position.Bottom}
              id="fallback"
              className={cn(cardStyles.handle, '!bg-gray-400')}
              style={{ left: `${((options.length + 1) / (options.length + 2)) * 100}%` }}
            />
            <span
              className="absolute text-[8px] bg-gray-400 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none"
              style={{ left: `${((options.length + 1) / (options.length + 2)) * 100}%`, bottom: -8, transform: 'translate(-50%, 100%)' }}
            >
              outro
            </span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className={cardStyles.handle} />
      )}
      {/* Right-side handles mirroring bottom options */}
      {options.length > 0 ? (
        <>
          {options.map((opt, i) => (
            <div key={`right-${opt.id}`}>
              <Handle
                type="source"
                position={Position.Right}
                id={`right-${opt.id}`}
                className={cardStyles.handle}
                style={{ top: `${((i + 1) / (options.length + 2)) * 100}%` }}
              />
              <span
                className="absolute text-[8px] bg-purple-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none"
                style={{ right: -8, top: `${((i + 1) / (options.length + 2)) * 100}%`, transform: 'translate(100%, -50%)' }}
              >
                {opt.trigger}
              </span>
            </div>
          ))}
          <div>
            <Handle
              type="source"
              position={Position.Right}
              id="right-fallback"
              className={cn(cardStyles.handle, '!bg-gray-400')}
              style={{ top: `${((options.length + 1) / (options.length + 2)) * 100}%` }}
            />
            <span
              className="absolute text-[8px] bg-gray-400 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none"
              style={{ right: -8, top: `${((options.length + 1) / (options.length + 2)) * 100}%`, transform: 'translate(100%, -50%)' }}
            >
              outro
            </span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Right} id="source-right" className={cardStyles.handle} />
      )}
    </div>
  )
})
MenuNode.displayName = 'MenuNode'

// Buttons Node
export const ButtonsNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, gradients.interaction)}>
      <MousePointer className="w-4 h-4" />
      <div>
        <span>Botões</span>
        <div className={cardStyles.subtitle}>Resposta rápida</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      {data.content && <p className="mb-2 font-medium text-gray-700">{data.content}</p>}
      {data.buttons && data.buttons.length > 0 ? (
        <div className="space-y-1">
          {data.buttons.map((btn, i) => (
            <div key={i} className="px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg text-center text-xs font-medium">
              {btn.text}
            </div>
          ))}
        </div>
      ) : (
        <p className="italic text-gray-400">Adicione botões...</p>
      )}
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">{data.buttons?.length || 0} botões</span>
      <ActionButtons />
    </div>
    {data.buttons && data.buttons.length > 0 ? (
      data.buttons.map((btn, i) => (
        <div key={btn.id}>
          <Handle
            type="source"
            position={Position.Bottom}
            id={btn.id}
            className={cardStyles.handle}
            style={{ left: `${((i + 1) / (data.buttons!.length + 1)) * 100}%` }}
          />
          <span
            className="absolute text-[8px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none"
            style={{ left: `${((i + 1) / (data.buttons!.length + 1)) * 100}%`, bottom: -8, transform: 'translate(-50%, 100%)' }}
          >
            {btn.text}
          </span>
        </div>
      ))
    ) : (
      <Handle type="source" position={Position.Bottom} className={cardStyles.handle} />
    )}
    {/* Right-side handles mirroring bottom buttons */}
    {data.buttons && data.buttons.length > 0 ? (
      data.buttons.map((btn, i) => (
        <div key={`right-${btn.id}`}>
          <Handle
            type="source"
            position={Position.Right}
            id={`right-${btn.id}`}
            className={cardStyles.handle}
            style={{ top: `${((i + 1) / (data.buttons!.length + 1)) * 100}%` }}
          />
          <span
            className="absolute text-[8px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none"
            style={{ right: -8, top: `${((i + 1) / (data.buttons!.length + 1)) * 100}%`, transform: 'translate(100%, -50%)' }}
          >
            {btn.text}
          </span>
        </div>
      ))
    ) : (
      <Handle type="source" position={Position.Right} id="source-right" className={cardStyles.handle} />
    )}
  </div>
))
ButtonsNode.displayName = 'ButtonsNode'

// List Node
export const ListNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => {
  const allRows = data.listSections?.flatMap(section => section.rows) || []

  return (
    <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
      <InputHandles />
      <div className={cn(cardStyles.header, gradients.interaction)}>
        <List className="w-4 h-4" />
        <div>
          <span>Lista</span>
          <div className={cardStyles.subtitle}>Menu Cloud API</div>
        </div>
      </div>
      <div className={cardStyles.body}>
        {data.content && <p className="mb-2 font-medium text-gray-700">{data.content}</p>}
        {data.listSections && data.listSections.length > 0 ? (
          <div className="space-y-2">
            {data.listSections.map((section, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-2">
                <span className="text-[10px] font-semibold text-gray-500 uppercase">{section.title}</span>
                <div className="mt-1 space-y-0.5">
                  {section.rows.slice(0, 2).map((row, j) => (
                    <div key={j} className="text-xs text-gray-600 pl-2 border-l-2 border-pink-300">
                      {row.title}
                    </div>
                  ))}
                  {section.rows.length > 2 && (
                    <div className="text-[10px] text-gray-400 pl-2">+{section.rows.length - 2} mais</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="italic text-gray-400">Configure a lista...</p>
        )}
      </div>
      <div className={cardStyles.footer}>
        <span className="text-[10px] text-gray-400">{allRows.length} itens</span>
        <ActionButtons />
      </div>
      {allRows.length > 0 ? (
        allRows.map((row, i) => (
          <div key={row.id}>
            <Handle
              type="source"
              position={Position.Bottom}
              id={row.id}
              className={cardStyles.handle}
              style={{ left: `${((i + 1) / (allRows.length + 1)) * 100}%` }}
            />
            <span
              className="absolute text-[8px] bg-pink-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none"
              style={{ left: `${((i + 1) / (allRows.length + 1)) * 100}%`, bottom: -8, transform: 'translate(-50%, 100%)' }}
            >
              {row.title}
            </span>
          </div>
        ))
      ) : (
        <Handle type="source" position={Position.Bottom} className={cardStyles.handle} />
      )}
      {/* Right-side handles mirroring bottom rows */}
      {allRows.length > 0 ? (
        allRows.map((row, i) => (
          <div key={`right-${row.id}`}>
            <Handle
              type="source"
              position={Position.Right}
              id={`right-${row.id}`}
              className={cardStyles.handle}
              style={{ top: `${((i + 1) / (allRows.length + 1)) * 100}%` }}
            />
            <span
              className="absolute text-[8px] bg-pink-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none"
              style={{ right: -8, top: `${((i + 1) / (allRows.length + 1)) * 100}%`, transform: 'translate(100%, -50%)' }}
            >
              {row.title}
            </span>
          </div>
        ))
      ) : (
        <Handle type="source" position={Position.Right} id="source-right" className={cardStyles.handle} />
      )}
    </div>
  )
})
ListNode.displayName = 'ListNode'

// Condition Node - Switch/Case style with multiple values
export const ConditionNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => {
  const cases = data.condition?.cases || []
  const hasOldFormat = !cases.length && data.condition?.value !== undefined

  // Old format compatibility: show as yes/no
  if (hasOldFormat && data.condition) {
    return (
      <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
        <InputHandles />
        <div className={cn(cardStyles.header, gradients.logic)}>
          <GitBranch className="w-4 h-4" />
          <div>
            <span>Condição</span>
            <div className={cardStyles.subtitle}>Se / Senão</div>
          </div>
        </div>
        <div className={cardStyles.body}>
          <div className="bg-amber-50 rounded-lg p-2 font-mono text-xs">
            <span className="text-amber-600">SE</span>{' '}
            <span className="bg-amber-100 px-1 rounded">{data.condition.variable}</span>{' '}
            <span className="text-amber-600">{data.condition.operator}</span>{' '}
            {data.condition.value && <span className="bg-amber-100 px-1 rounded">{data.condition.value}</span>}
          </div>
        </div>
        <div className={cardStyles.footer}>
          <span className="text-[10px] text-gray-400">2 saídas</span>
          <ActionButtons />
        </div>
        <Handle type="source" position={Position.Bottom} id="yes" className={cn(cardStyles.handle, '!bg-green-500')} style={{ left: '30%' }} />
        <span className="absolute text-[8px] bg-green-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none" style={{ left: '30%', bottom: -8, transform: 'translate(-50%, 100%)' }}>Sim</span>
        <Handle type="source" position={Position.Bottom} id="no" className={cn(cardStyles.handle, '!bg-red-500')} style={{ left: '70%' }} />
        <span className="absolute text-[8px] bg-red-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none" style={{ left: '70%', bottom: -8, transform: 'translate(-50%, 100%)' }}>{`Não`}</span>
        <Handle type="source" position={Position.Right} id="right-yes" className={cn(cardStyles.handle, '!bg-green-500')} style={{ top: '33%' }} />
        <span className="absolute text-[8px] bg-green-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none" style={{ right: -8, top: '33%', transform: 'translate(100%, -50%)' }}>Sim</span>
        <Handle type="source" position={Position.Right} id="right-no" className={cn(cardStyles.handle, '!bg-red-500')} style={{ top: '66%' }} />
        <span className="absolute text-[8px] bg-red-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none" style={{ right: -8, top: '66%', transform: 'translate(100%, -50%)' }}>{`Não`}</span>
      </div>
    )
  }

  const operatorLabels: Record<string, string> = {
    equals: '=', contains: '∋', startsWith: '⊳', endsWith: '⊲', regex: '~', exists: '∃',
  }

  return (
    <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
      <InputHandles />
      <div className={cn(cardStyles.header, gradients.logic)}>
        <GitBranch className="w-4 h-4" />
        <div>
          <span>Condição</span>
          <div className={cardStyles.subtitle}>Switch / Caso</div>
        </div>
      </div>
      <div className={cardStyles.body}>
        {data.condition?.variable ? (
          <div className="space-y-1.5">
            <div className="bg-amber-50 rounded-lg px-2 py-1 font-mono text-xs">
              <span className="text-amber-600">SWITCH</span>{' '}
              <span className="bg-amber-100 px-1 rounded">{data.condition.variable}</span>{' '}
              <span className="text-amber-600">{operatorLabels[data.condition.operator] || data.condition.operator}</span>
            </div>
            {cases.map((c, i) => (
              <div key={c.id} className="flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                <span className="text-xs text-gray-700 font-mono">{c.value || '""'}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg">
              <span className="w-5 h-5 rounded-full bg-gray-400 text-white text-[10px] flex items-center justify-center font-bold">∅</span>
              <span className="text-xs text-gray-400 italic">fallback</span>
            </div>
          </div>
        ) : (
          <p className="italic text-gray-400">Configure a condição...</p>
        )}
      </div>
      <div className={cardStyles.footer}>
        <span className="text-[10px] text-gray-400">{cases.length} valores + fallback</span>
        <ActionButtons />
      </div>
      {/* Bottom handles per case + fallback */}
      {cases.length > 0 ? (
        <>
          {cases.map((c, i) => (
            <div key={c.id}>
              <Handle type="source" position={Position.Bottom} id={c.id} className={cn(cardStyles.handle, '!bg-amber-500')} style={{ left: `${((i + 1) / (cases.length + 2)) * 100}%` }} />
              <span className="absolute text-[8px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none" style={{ left: `${((i + 1) / (cases.length + 2)) * 100}%`, bottom: -8, transform: 'translate(-50%, 100%)' }}>{c.value || '""'}</span>
            </div>
          ))}
          <div>
            <Handle type="source" position={Position.Bottom} id="fallback" className={cn(cardStyles.handle, '!bg-gray-400')} style={{ left: `${((cases.length + 1) / (cases.length + 2)) * 100}%` }} />
            <span className="absolute text-[8px] bg-gray-400 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none" style={{ left: `${((cases.length + 1) / (cases.length + 2)) * 100}%`, bottom: -8, transform: 'translate(-50%, 100%)' }}>outro</span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className={cardStyles.handle} />
      )}
      {/* Right handles per case + fallback */}
      {cases.length > 0 ? (
        <>
          {cases.map((c, i) => (
            <div key={`right-${c.id}`}>
              <Handle type="source" position={Position.Right} id={`right-${c.id}`} className={cn(cardStyles.handle, '!bg-amber-500')} style={{ top: `${((i + 1) / (cases.length + 2)) * 100}%` }} />
              <span className="absolute text-[8px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none" style={{ right: -8, top: `${((i + 1) / (cases.length + 2)) * 100}%`, transform: 'translate(100%, -50%)' }}>{c.value || '""'}</span>
            </div>
          ))}
          <div>
            <Handle type="source" position={Position.Right} id="right-fallback" className={cn(cardStyles.handle, '!bg-gray-400')} style={{ top: `${((cases.length + 1) / (cases.length + 2)) * 100}%` }} />
            <span className="absolute text-[8px] bg-gray-400 text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap pointer-events-none" style={{ right: -8, top: `${((cases.length + 1) / (cases.length + 2)) * 100}%`, transform: 'translate(100%, -50%)' }}>outro</span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Right} id="source-right" className={cardStyles.handle} />
      )}
    </div>
  )
})
ConditionNode.displayName = 'ConditionNode'

// Delay Node
export const DelayNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, gradients.logic)}>
      <Clock className="w-4 h-4" />
      <div>
        <span>Aguardar</span>
        <div className={cardStyles.subtitle}>Delay</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      <div className="text-center py-2">
        <span className="text-3xl font-bold text-amber-600">{data.delay || 1}</span>
        <span className="text-gray-500 ml-1">segundos</span>
      </div>
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">Timer</span>
      <ActionButtons />
    </div>
    <OutputHandles />
  </div>
))
DelayNode.displayName = 'DelayNode'

// Set Variable Node
export const SetVariableNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, gradients.data)}>
      <Database className="w-4 h-4" />
      <div>
        <span>Variável</span>
        <div className={cardStyles.subtitle}>Salvar dado</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      {data.variable ? (
        <div className="bg-emerald-50 rounded-lg p-2 font-mono text-xs">
          <span className="text-emerald-600 bg-emerald-100 px-1 rounded">{data.variable}</span>
          <span className="text-gray-400 mx-1">=</span>
          <span className="text-gray-600">{data.value || '""'}</span>
        </div>
      ) : (
        <p className="italic text-gray-400">Configure a variável...</p>
      )}
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">Dados</span>
      <ActionButtons />
    </div>
    <OutputHandles />
  </div>
))
SetVariableNode.displayName = 'SetVariableNode'

// HTTP Request Node
export const HttpRequestNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => {
  const headersCount = data.httpConfig?.headers?.length || 0
  const mappingsCount = data.httpConfig?.responseMappings?.length || 0

  return (
    <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
      <InputHandles />
      <div className={cn(cardStyles.header, gradients.api)}>
        <Globe className="w-4 h-4" />
        <div>
          <span>Requisição HTTP</span>
          <div className={cardStyles.subtitle}>API Externa</div>
        </div>
      </div>
      <div className={cardStyles.body}>
        {data.httpConfig?.url ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-bold">
                {data.httpConfig.method || 'GET'}
              </span>
              {headersCount > 0 && (
                <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">
                  {headersCount} header{headersCount > 1 ? 's' : ''}
                </span>
              )}
              {mappingsCount > 0 && (
                <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[10px]">
                  {mappingsCount} var{mappingsCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="truncate font-mono text-xs bg-gray-50 px-2 py-1 rounded">{data.httpConfig.url}</p>
            {mappingsCount > 0 && (
              <div className="space-y-0.5">
                {data.httpConfig.responseMappings!.slice(0, 2).map((m, i) => (
                  <p key={i} className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded truncate">
                    {m.path} → <span className="font-semibold">{m.variable}</span>
                  </p>
                ))}
                {mappingsCount > 2 && (
                  <p className="text-[10px] text-gray-400">+{mappingsCount - 2} mais</p>
                )}
              </div>
            )}
            {data.httpConfig.responseVariable && !mappingsCount && (
              <p className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                → {data.httpConfig.responseVariable}
              </p>
            )}
          </div>
        ) : (
          <p className="italic text-gray-400">Configure a requisição...</p>
        )}
      </div>
      <div className={cardStyles.footer}>
        <span className="text-[10px] text-gray-400">API</span>
        <ActionButtons />
      </div>
      <OutputHandles />
    </div>
  )
})
HttpRequestNode.displayName = 'HttpRequestNode'

// Transfer Node
export const TransferNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, gradients.transfer)}>
      <Users className="w-4 h-4" />
      <div>
        <span>Transferir</span>
        <div className={cardStyles.subtitle}>Atendimento Humano</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
        <PhoneForwarded className="w-5 h-5 text-gray-400" />
        <span className="text-gray-600">{data.content || 'Transferir para atendente'}</span>
      </div>
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">Humano</span>
      <ActionButtons />
    </div>
  </div>
))
TransferNode.displayName = 'TransferNode'

// Go To Flow Node
export const GoToFlowNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, gradients.api)}>
      <ArrowRight className="w-4 h-4" />
      <div>
        <span>Ir para Fluxo</span>
        <div className={cardStyles.subtitle}>Outro fluxo</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      <p className="italic text-gray-400">Selecione um fluxo...</p>
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">Redirect</span>
      <ActionButtons />
    </div>
  </div>
))
GoToFlowNode.displayName = 'GoToFlowNode'

// End Node
export const EndNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(cardStyles.base, selected && cardStyles.selected)}>
    <InputHandles />
    <div className={cn(cardStyles.header, gradients.end)}>
      <XCircle className="w-4 h-4" />
      <div>
        <span>Encerrar</span>
        <div className={cardStyles.subtitle}>Fim do fluxo</div>
      </div>
    </div>
    <div className={cardStyles.body}>
      {data.content ? (
        <p className="text-gray-600">{data.content}</p>
      ) : (
        <div className="flex items-center justify-center gap-2 text-gray-400 py-2">
          <StopCircle className="w-5 h-5" />
          <span>Conversa finalizada</span>
        </div>
      )}
    </div>
    <div className={cardStyles.footer}>
      <span className="text-[10px] text-gray-400">Final</span>
      <ActionButtons />
    </div>
  </div>
))
EndNode.displayName = 'EndNode'

// Export node types mapping
export const nodeTypes = {
  START: StartNode,
  MESSAGE: MessageNode,
  IMAGE: ImageNode,
  AUDIO: AudioNode,
  VIDEO: VideoNode,
  DOCUMENT: DocumentNode,
  MENU: MenuNode,
  BUTTONS: ButtonsNode,
  LIST: ListNode,
  CONDITION: ConditionNode,
  DELAY: DelayNode,
  SET_VARIABLE: SetVariableNode,
  HTTP_REQUEST: HttpRequestNode,
  TRANSFER: TransferNode,
  GO_TO_FLOW: GoToFlowNode,
  END: EndNode,
}
