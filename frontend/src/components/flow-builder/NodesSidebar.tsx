import {
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
  Menu,
  GripVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NodeItem {
  type: string
  label: string
  icon: any
  gradient: string
  description: string
}

const nodeCategories = [
  {
    name: 'Mensagens',
    color: 'text-pink-600',
    nodes: [
      { type: 'MESSAGE', label: 'Mensagem', icon: MessageSquare, gradient: 'from-pink-500 to-purple-500', description: 'Enviar texto' },
      { type: 'IMAGE', label: 'Imagem', icon: Image, gradient: 'from-purple-500 to-pink-500', description: 'Enviar imagem' },
      { type: 'AUDIO', label: 'Audio', icon: Mic, gradient: 'from-pink-400 to-rose-500', description: 'Enviar audio' },
      { type: 'VIDEO', label: 'Video', icon: Video, gradient: 'from-rose-500 to-pink-500', description: 'Enviar video' },
      { type: 'DOCUMENT', label: 'Documento', icon: FileText, gradient: 'from-purple-400 to-pink-400', description: 'Enviar arquivo' },
    ],
  },
  {
    name: 'Interacao',
    color: 'text-cyan-600',
    nodes: [
      { type: 'MENU', label: 'Menu', icon: Menu, gradient: 'from-cyan-500 to-teal-500', description: 'Menu numerado' },
      { type: 'BUTTONS', label: 'Botoes', icon: MousePointer, gradient: 'from-indigo-500 to-purple-500', description: 'Botoes clicaveis' },
      { type: 'LIST', label: 'Lista', icon: List, gradient: 'from-teal-500 to-cyan-500', description: 'Lista Cloud API' },
    ],
  },
  {
    name: 'Logica',
    color: 'text-emerald-600',
    nodes: [
      { type: 'CONDITION', label: 'Condicao', icon: GitBranch, gradient: 'from-emerald-500 to-green-500', description: 'Se/Senao' },
      { type: 'DELAY', label: 'Aguardar', icon: Clock, gradient: 'from-gray-500 to-slate-500', description: 'Pausar execucao' },
      { type: 'SET_VARIABLE', label: 'Variavel', icon: Variable, gradient: 'from-green-500 to-emerald-500', description: 'Definir valor' },
    ],
  },
  {
    name: 'Avancado',
    color: 'text-blue-600',
    nodes: [
      { type: 'HTTP_REQUEST', label: 'HTTP', icon: Globe, gradient: 'from-blue-500 to-indigo-500', description: 'Requisicao API' },
      { type: 'TRANSFER', label: 'Transferir', icon: PhoneForwarded, gradient: 'from-slate-500 to-gray-500', description: 'Para atendente' },
      { type: 'GO_TO_FLOW', label: 'Ir para', icon: ArrowRight, gradient: 'from-violet-500 to-purple-500', description: 'Outro fluxo' },
      { type: 'END', label: 'Fim', icon: StopCircle, gradient: 'from-red-500 to-rose-500', description: 'Encerrar' },
    ],
  },
]

export function NodesSidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-72 bg-white dark:bg-zinc-950 border-r border-gray-200 dark:border-zinc-800 overflow-y-auto shadow-lg">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-zinc-950 z-10 border-b border-gray-100 dark:border-zinc-800">
        <div className="px-4 py-3">
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Componentes
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Arraste para o canvas
          </p>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {nodeCategories.map((category) => (
          <div key={category.name}>
            {/* Category Header */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className={cn('h-1.5 w-1.5 rounded-full',
                category.name === 'Mensagens' ? 'bg-pink-500' :
                category.name === 'Interacao' ? 'bg-cyan-500' :
                category.name === 'Logica' ? 'bg-emerald-500' : 'bg-blue-500'
              )} />
              <h4 className={cn(
                'text-xs font-semibold uppercase tracking-wider',
                category.color
              )}>
                {category.name}
              </h4>
            </div>

            {/* Nodes Grid */}
            <div className="grid grid-cols-2 gap-2">
              {category.nodes.map((node) => {
                const Icon = node.icon
                return (
                  <div
                    key={node.type}
                    draggable
                    onDragStart={(e) => onDragStart(e, node.type)}
                    className={cn(
                      'group relative flex flex-col items-center gap-1.5 p-3 rounded-xl',
                      'bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800',
                      'cursor-grab active:cursor-grabbing',
                      'hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-700',
                      'hover:scale-105 active:scale-95',
                      'transition-all duration-200 ease-out'
                    )}
                  >
                    {/* Drag Indicator */}
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-50 transition-opacity">
                      <GripVertical className="h-3 w-3 text-gray-400" />
                    </div>

                    {/* Icon with gradient background */}
                    <div className={cn(
                      'p-2 rounded-lg bg-gradient-to-br shadow-sm',
                      node.gradient
                    )}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>

                    {/* Label */}
                    <div className="text-center">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                        {node.label}
                      </p>
                    </div>

                    {/* Hover tooltip */}
                    <div className={cn(
                      'absolute -bottom-8 left-1/2 -translate-x-1/2 z-50',
                      'px-2 py-1 rounded bg-gray-900 text-white text-xs whitespace-nowrap',
                      'opacity-0 group-hover:opacity-100 pointer-events-none',
                      'transition-opacity duration-200'
                    )}>
                      {node.description}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer with tips */}
      <div className="sticky bottom-0 bg-gradient-to-t from-white via-white dark:from-zinc-950 dark:via-zinc-950 to-transparent pt-6 pb-3 px-3">
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
          <p className="text-xs text-purple-700 dark:text-purple-300">
            <span className="font-semibold">Dica:</span> Use Ctrl+S para salvar rapidamente
          </p>
        </div>
      </div>
    </div>
  )
}
