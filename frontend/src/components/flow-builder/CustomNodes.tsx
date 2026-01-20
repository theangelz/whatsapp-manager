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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BaseNodeProps {
  data: {
    label?: string
    content?: string
    buttons?: Array<{ id: string; text: string }>
    listSections?: Array<{ title: string; rows: Array<{ id: string; title: string }> }>
    delay?: number
    variable?: string
    value?: string
    condition?: { variable: string; operator: string; value?: string }
    mediaUrl?: string
  }
  selected?: boolean
}

const nodeStyles = {
  base: 'rounded-lg border-2 shadow-sm min-w-[180px] bg-white dark:bg-zinc-900',
  selected: 'ring-2 ring-primary ring-offset-2',
  header: 'flex items-center gap-2 p-2 border-b font-medium text-sm',
  content: 'p-3 text-xs text-muted-foreground',
  handle: 'w-3 h-3 !bg-primary border-2 border-white',
}

// Start Node
export const StartNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-green-500', selected && nodeStyles.selected)}>
    <div className={cn(nodeStyles.header, 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400')}>
      <Play className="h-4 w-4" />
      <span>Inicio</span>
    </div>
    <div className={nodeStyles.content}>
      {data.label || 'Ponto de entrada do fluxo'}
    </div>
    <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
  </div>
))
StartNode.displayName = 'StartNode'

// Message Node
export const MessageNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-blue-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400')}>
      <MessageSquare className="h-4 w-4" />
      <span>Mensagem</span>
    </div>
    <div className={nodeStyles.content}>
      {data.content ? (
        <p className="line-clamp-3">{data.content}</p>
      ) : (
        <p className="italic">Clique para configurar...</p>
      )}
    </div>
    <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
  </div>
))
MessageNode.displayName = 'MessageNode'

// Image Node
export const ImageNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-purple-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400')}>
      <Image className="h-4 w-4" />
      <span>Imagem</span>
    </div>
    <div className={nodeStyles.content}>
      {data.mediaUrl ? (
        <div className="space-y-1">
          <p className="truncate text-xs">{data.mediaUrl}</p>
          {data.content && <p className="line-clamp-2">{data.content}</p>}
        </div>
      ) : (
        <p className="italic">Clique para configurar...</p>
      )}
    </div>
    <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
  </div>
))
ImageNode.displayName = 'ImageNode'

// Audio Node
export const AudioNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-pink-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-400')}>
      <Mic className="h-4 w-4" />
      <span>Audio</span>
    </div>
    <div className={nodeStyles.content}>
      {data.mediaUrl ? (
        <p className="truncate">{data.mediaUrl}</p>
      ) : (
        <p className="italic">Clique para configurar...</p>
      )}
    </div>
    <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
  </div>
))
AudioNode.displayName = 'AudioNode'

// Video Node
export const VideoNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-red-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400')}>
      <Video className="h-4 w-4" />
      <span>Video</span>
    </div>
    <div className={nodeStyles.content}>
      {data.mediaUrl ? (
        <div className="space-y-1">
          <p className="truncate text-xs">{data.mediaUrl}</p>
          {data.content && <p className="line-clamp-2">{data.content}</p>}
        </div>
      ) : (
        <p className="italic">Clique para configurar...</p>
      )}
    </div>
    <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
  </div>
))
VideoNode.displayName = 'VideoNode'

// Document Node
export const DocumentNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-orange-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400')}>
      <FileText className="h-4 w-4" />
      <span>Documento</span>
    </div>
    <div className={nodeStyles.content}>
      {data.mediaUrl ? (
        <p className="truncate">{data.mediaUrl}</p>
      ) : (
        <p className="italic">Clique para configurar...</p>
      )}
    </div>
    <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
  </div>
))
DocumentNode.displayName = 'DocumentNode'

// Buttons Node
export const ButtonsNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-indigo-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400')}>
      <MousePointer className="h-4 w-4" />
      <span>Botoes</span>
    </div>
    <div className={nodeStyles.content}>
      {data.content && <p className="line-clamp-2 mb-2">{data.content}</p>}
      {data.buttons && data.buttons.length > 0 ? (
        <div className="space-y-1">
          {data.buttons.map((btn, i) => (
            <div key={i} className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 rounded text-xs">
              {btn.text}
            </div>
          ))}
        </div>
      ) : (
        <p className="italic">Adicione botoes...</p>
      )}
    </div>
    {data.buttons?.map((btn, i) => (
      <Handle
        key={btn.id}
        type="source"
        position={Position.Bottom}
        id={btn.id}
        className={nodeStyles.handle}
        style={{ left: `${((i + 1) / (data.buttons!.length + 1)) * 100}%` }}
      />
    ))}
    {(!data.buttons || data.buttons.length === 0) && (
      <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
    )}
  </div>
))
ButtonsNode.displayName = 'ButtonsNode'

// List Node
export const ListNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-cyan-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400')}>
      <List className="h-4 w-4" />
      <span>Lista/Menu</span>
    </div>
    <div className={nodeStyles.content}>
      {data.content && <p className="line-clamp-2 mb-2">{data.content}</p>}
      {data.listSections && data.listSections.length > 0 ? (
        <div className="space-y-1">
          {data.listSections.map((section, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium">{section.title}</span>
              <span className="text-muted-foreground"> ({section.rows.length} itens)</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="italic">Configure a lista...</p>
      )}
    </div>
    <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
  </div>
))
ListNode.displayName = 'ListNode'

// Condition Node
export const ConditionNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-yellow-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400')}>
      <GitBranch className="h-4 w-4" />
      <span>Condicao</span>
    </div>
    <div className={nodeStyles.content}>
      {data.condition ? (
        <p className="text-xs">
          Se <span className="font-mono bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">{data.condition.variable}</span>
          {' '}{data.condition.operator}{' '}
          {data.condition.value && <span className="font-mono bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">{data.condition.value}</span>}
        </p>
      ) : (
        <p className="italic">Configure a condicao...</p>
      )}
    </div>
    <div className="flex justify-between px-3 pb-2 text-xs">
      <span className="text-green-600">Sim</span>
      <span className="text-red-600">Nao</span>
    </div>
    <Handle
      type="source"
      position={Position.Bottom}
      id="yes"
      className={cn(nodeStyles.handle, '!bg-green-500')}
      style={{ left: '30%' }}
    />
    <Handle
      type="source"
      position={Position.Bottom}
      id="no"
      className={cn(nodeStyles.handle, '!bg-red-500')}
      style={{ left: '70%' }}
    />
  </div>
))
ConditionNode.displayName = 'ConditionNode'

// Delay Node
export const DelayNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-gray-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-400')}>
      <Clock className="h-4 w-4" />
      <span>Aguardar</span>
    </div>
    <div className={nodeStyles.content}>
      <p className="text-center font-mono text-lg">{data.delay || 1}s</p>
    </div>
    <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
  </div>
))
DelayNode.displayName = 'DelayNode'

// Set Variable Node
export const SetVariableNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-teal-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400')}>
      <Variable className="h-4 w-4" />
      <span>Variavel</span>
    </div>
    <div className={nodeStyles.content}>
      {data.variable ? (
        <p className="text-xs">
          <span className="font-mono bg-teal-100 dark:bg-teal-900/40 px-1 rounded">{data.variable}</span>
          {' = '}
          <span className="font-mono">{data.value || '""'}</span>
        </p>
      ) : (
        <p className="italic">Configure a variavel...</p>
      )}
    </div>
    <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
  </div>
))
SetVariableNode.displayName = 'SetVariableNode'

// HTTP Request Node
export const HttpRequestNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-emerald-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400')}>
      <Globe className="h-4 w-4" />
      <span>HTTP Request</span>
    </div>
    <div className={nodeStyles.content}>
      <p className="italic">Configure a requisicao...</p>
    </div>
    <Handle type="source" position={Position.Bottom} className={nodeStyles.handle} />
  </div>
))
HttpRequestNode.displayName = 'HttpRequestNode'

// Transfer Node
export const TransferNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-amber-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400')}>
      <PhoneForwarded className="h-4 w-4" />
      <span>Transferir</span>
    </div>
    <div className={nodeStyles.content}>
      {data.content || 'Transferir para atendente'}
    </div>
  </div>
))
TransferNode.displayName = 'TransferNode'

// Go To Flow Node
export const GoToFlowNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-violet-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400')}>
      <ArrowRight className="h-4 w-4" />
      <span>Ir para Fluxo</span>
    </div>
    <div className={nodeStyles.content}>
      <p className="italic">Selecione um fluxo...</p>
    </div>
  </div>
))
GoToFlowNode.displayName = 'GoToFlowNode'

// End Node
export const EndNode = memo(({ data, selected }: NodeProps<BaseNodeProps['data']>) => (
  <div className={cn(nodeStyles.base, 'border-red-500', selected && nodeStyles.selected)}>
    <Handle type="target" position={Position.Top} className={nodeStyles.handle} />
    <div className={cn(nodeStyles.header, 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400')}>
      <StopCircle className="h-4 w-4" />
      <span>Fim</span>
    </div>
    <div className={nodeStyles.content}>
      {data.content || 'Finalizar conversa'}
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
