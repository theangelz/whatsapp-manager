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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NodeItem {
  type: string
  label: string
  icon: any
  color: string
  description: string
}

const nodeCategories = [
  {
    name: 'Mensagens',
    nodes: [
      { type: 'MESSAGE', label: 'Mensagem', icon: MessageSquare, color: 'bg-blue-500', description: 'Enviar texto' },
      { type: 'IMAGE', label: 'Imagem', icon: Image, color: 'bg-purple-500', description: 'Enviar imagem' },
      { type: 'AUDIO', label: 'Audio', icon: Mic, color: 'bg-pink-500', description: 'Enviar audio' },
      { type: 'VIDEO', label: 'Video', icon: Video, color: 'bg-red-500', description: 'Enviar video' },
      { type: 'DOCUMENT', label: 'Documento', icon: FileText, color: 'bg-orange-500', description: 'Enviar arquivo' },
    ],
  },
  {
    name: 'Interacao',
    nodes: [
      { type: 'BUTTONS', label: 'Botoes', icon: MousePointer, color: 'bg-indigo-500', description: 'Botoes clicaveis' },
      { type: 'LIST', label: 'Lista', icon: List, color: 'bg-cyan-500', description: 'Menu de opcoes' },
    ],
  },
  {
    name: 'Logica',
    nodes: [
      { type: 'CONDITION', label: 'Condicao', icon: GitBranch, color: 'bg-yellow-500', description: 'Se/Senao' },
      { type: 'DELAY', label: 'Aguardar', icon: Clock, color: 'bg-gray-500', description: 'Pausar execucao' },
      { type: 'SET_VARIABLE', label: 'Variavel', icon: Variable, color: 'bg-teal-500', description: 'Definir valor' },
    ],
  },
  {
    name: 'Avancado',
    nodes: [
      { type: 'HTTP_REQUEST', label: 'HTTP', icon: Globe, color: 'bg-emerald-500', description: 'Requisicao API' },
      { type: 'TRANSFER', label: 'Transferir', icon: PhoneForwarded, color: 'bg-amber-500', description: 'Para atendente' },
      { type: 'GO_TO_FLOW', label: 'Ir para', icon: ArrowRight, color: 'bg-violet-500', description: 'Outro fluxo' },
      { type: 'END', label: 'Fim', icon: StopCircle, color: 'bg-red-500', description: 'Encerrar' },
    ],
  },
]

export function NodesSidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-64 bg-muted/30 border-r overflow-y-auto">
      <div className="p-4">
        <h3 className="font-semibold mb-4">Arraste para adicionar</h3>

        {nodeCategories.map((category) => (
          <div key={category.name} className="mb-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {category.name}
            </h4>
            <div className="space-y-2">
              {category.nodes.map((node) => {
                const Icon = node.icon
                return (
                  <div
                    key={node.type}
                    draggable
                    onDragStart={(e) => onDragStart(e, node.type)}
                    className={cn(
                      'flex items-center gap-3 p-2 rounded-lg border bg-white dark:bg-zinc-900',
                      'cursor-grab active:cursor-grabbing',
                      'hover:shadow-md transition-shadow'
                    )}
                  >
                    <div className={cn('p-1.5 rounded', node.color)}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{node.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{node.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
