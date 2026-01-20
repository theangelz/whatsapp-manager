import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ReactFlowProvider,
  ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  ArrowLeft,
  Save,
  Play,
  Pause,
  Settings,
  Loader2,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { nodeTypes } from '@/components/flow-builder/CustomNodes'
import { NodesSidebar } from '@/components/flow-builder/NodesSidebar'
import { NodeProperties } from '@/components/flow-builder/NodeProperties'
import api from '@/services/api'
import type { FlowWithDetails, FlowNodeData, FlowTriggerType, Instance } from '@/types'

function FlowEditorContent() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const { data: flow, isLoading } = useQuery<FlowWithDetails>({
    queryKey: ['flow', id],
    queryFn: async () => {
      const response = await api.get(`/flows/${id}`)
      return response.data
    },
  })

  const { data: instances } = useQuery<Instance[]>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  const [flowSettings, setFlowSettings] = useState({
    name: '',
    description: '',
    triggerType: 'KEYWORD' as FlowTriggerType,
    triggerValue: '',
    instanceId: '',
  })

  // Load flow data
  useEffect(() => {
    if (flow) {
      // Convert flow nodes to React Flow format
      const rfNodes: Node[] = flow.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: { x: node.positionX, y: node.positionY },
        data: node.data,
      }))

      // Convert flow edges to React Flow format
      const rfEdges: Edge[] = flow.edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        sourceHandle: edge.sourceHandle || undefined,
        targetHandle: edge.targetHandle || undefined,
        label: edge.label || undefined,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
      }))

      setNodes(rfNodes)
      setEdges(rfEdges)
      setFlowSettings({
        name: flow.name,
        description: flow.description || '',
        triggerType: flow.triggerType,
        triggerValue: flow.triggerValue || '',
        instanceId: flow.instanceId || '',
      })
    }
  }, [flow, setNodes, setEdges])

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Convert React Flow format to API format
      const apiNodes = nodes.map((node) => ({
        id: node.id,
        type: node.type,
        positionX: node.position.x,
        positionY: node.position.y,
        data: node.data,
        label: node.data?.label,
      }))

      const apiEdges = edges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        label: edge.label,
      }))

      await api.put(`/flows/${id}/canvas`, {
        nodes: apiNodes,
        edges: apiEdges,
      })
    },
    onSuccess: () => {
      setHasUnsavedChanges(false)
      queryClient.invalidateQueries({ queryKey: ['flow', id] })
    },
  })

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: typeof flowSettings) => {
      await api.put(`/flows/${id}`, {
        ...data,
        instanceId: data.instanceId || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow', id] })
      setSettingsOpen(false)
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      await api.put(`/flows/${id}`, { status })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow', id] })
    },
  })

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
          },
          eds
        )
      )
      setHasUnsavedChanges(true)
    },
    [setEdges]
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow')
      if (!type || !reactFlowInstance || !reactFlowWrapper.current) return

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: Node = {
        id: `node_${Date.now()}`,
        type,
        position,
        data: { label: type },
      }

      setNodes((nds) => [...nds, newNode])
      setHasUnsavedChanges(true)
    },
    [reactFlowInstance, setNodes]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const updateNodeData = useCallback(
    (nodeId: string, data: FlowNodeData) => {
      setNodes((nds) =>
        nds.map((node) => (node.id === nodeId ? { ...node, data } : node))
      )
      setHasUnsavedChanges(true)
    },
    [setNodes]
  )

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return
    if (selectedNode.type === 'START') {
      alert('Nao e possivel excluir o node de inicio')
      return
    }
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id)
    )
    setSelectedNode(null)
    setHasUnsavedChanges(true)
  }, [selectedNode, setNodes, setEdges])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          deleteSelectedNode()
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveMutation.mutate()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNode, deleteSelectedNode, saveMutation])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!flow) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Fluxo nao encontrado</p>
      </div>
    )
  }

  const getStatusConfig = (status: string) => {
    const config: Record<string, { label: string; variant: string }> = {
      DRAFT: { label: 'Rascunho', variant: 'outline' },
      ACTIVE: { label: 'Ativo', variant: 'default' },
      INACTIVE: { label: 'Inativo', variant: 'secondary' },
    }
    return config[status] || config.DRAFT
  }

  const statusConfig = getStatusConfig(flow.status)

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-4 bg-background">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/flows')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold">{flow.name}</h1>
            <Badge variant={statusConfig.variant as any}>{statusConfig.label}</Badge>
            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-yellow-600">
                Nao salvo
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedNode && selectedNode.type !== 'START' && (
            <Button variant="outline" size="sm" onClick={deleteSelectedNode}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir Node
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Configuracoes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
          {flow.status === 'ACTIVE' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleStatusMutation.mutate('INACTIVE')}
            >
              <Pause className="h-4 w-4 mr-2" />
              Desativar
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => toggleStatusMutation.mutate('ACTIVE')}
            >
              <Play className="h-4 w-4 mr-2" />
              Ativar
            </Button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex">
        <NodesSidebar />

        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) => {
              onNodesChange(changes)
              if (changes.some((c) => c.type === 'position' && c.dragging === false)) {
                setHasUnsavedChanges(true)
              }
            }}
            onEdgesChange={(changes) => {
              onEdgesChange(changes)
              setHasUnsavedChanges(true)
            }}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: '#6366f1', strokeWidth: 2 },
            }}
          >
            <Controls />
            <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
          </ReactFlow>
        </div>

        {selectedNode && (
          <NodeProperties
            node={selectedNode}
            onUpdate={updateNodeData}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configuracoes do Fluxo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={flowSettings.name}
                onChange={(e) => setFlowSettings({ ...flowSettings, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Descricao</Label>
              <Textarea
                value={flowSettings.description}
                onChange={(e) =>
                  setFlowSettings({ ...flowSettings, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Gatilho</Label>
              <Select
                value={flowSettings.triggerType}
                onValueChange={(value: FlowTriggerType) =>
                  setFlowSettings({ ...flowSettings, triggerType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KEYWORD">Palavra-chave</SelectItem>
                  <SelectItem value="ALL">Todas as mensagens</SelectItem>
                  <SelectItem value="BUTTON_REPLY">Resposta de botao</SelectItem>
                  <SelectItem value="LIST_REPLY">Resposta de lista</SelectItem>
                  <SelectItem value="WEBHOOK">Webhook externo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {flowSettings.triggerType === 'KEYWORD' && (
              <div className="space-y-2">
                <Label>Palavra-chave</Label>
                <Input
                  value={flowSettings.triggerValue}
                  onChange={(e) =>
                    setFlowSettings({ ...flowSettings, triggerValue: e.target.value })
                  }
                  placeholder="oi, ola, menu"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Instancia</Label>
              <Select
                value={flowSettings.instanceId}
                onValueChange={(value) =>
                  setFlowSettings({ ...flowSettings, instanceId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as instancias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as instancias</SelectItem>
                  {Array.isArray(instances) && instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => updateSettingsMutation.mutate(flowSettings)}
              disabled={updateSettingsMutation.isPending}
            >
              {updateSettingsMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function FlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditorContent />
    </ReactFlowProvider>
  )
}
