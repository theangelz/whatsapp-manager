import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Workflow,
  Play,
  Pause,
  Trash2,
  Copy,
  Edit,
  MoreVertical,
  Users,
  Loader2,
  Zap,
  MessageSquare,
  Hash,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import api from '@/services/api'
import type { Flow, FlowTriggerType, Instance } from '@/types'

export function Flows() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newFlow, setNewFlow] = useState({
    name: '',
    description: '',
    triggerType: 'KEYWORD' as FlowTriggerType,
    triggerValue: '',
    instanceId: '',
  })

  const { data: flows, isLoading } = useQuery<Flow[]>({
    queryKey: ['flows'],
    queryFn: async () => {
      const response = await api.get('/flows')
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

  const [createError, setCreateError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: async (data: typeof newFlow) => {
      const response = await api.post('/flows', {
        ...data,
        instanceId: data.instanceId || null,
      })
      return response.data
    },
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      setCreateDialogOpen(false)
      setCreateError(null)
      setNewFlow({
        name: '',
        description: '',
        triggerType: 'KEYWORD',
        triggerValue: '',
        instanceId: '',
      })
      navigate(`/flows/${flow.id}`)
    },
    onError: (error: any) => {
      console.error('Erro ao criar fluxo:', error)
      setCreateError(error.response?.data?.error || error.message || 'Erro ao criar fluxo')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/flows/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await api.put(`/flows/${id}`, { status })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/flows/${id}/duplicate`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
    },
  })

  const getStatusConfig = (status: string) => {
    const config: Record<string, { label: string; variant: string; color: string }> = {
      DRAFT: { label: 'Rascunho', variant: 'outline', color: 'text-gray-600' },
      ACTIVE: { label: 'Ativo', variant: 'default', color: 'text-green-600' },
      INACTIVE: { label: 'Inativo', variant: 'secondary', color: 'text-yellow-600' },
    }
    return config[status] || config.DRAFT
  }

  const getTriggerConfig = (type: string) => {
    const config: Record<string, { label: string; icon: any }> = {
      KEYWORD: { label: 'Palavra-chave', icon: Hash },
      ALL: { label: 'Todas mensagens', icon: MessageSquare },
      BUTTON_REPLY: { label: 'Resposta de botao', icon: Zap },
      LIST_REPLY: { label: 'Resposta de lista', icon: Zap },
      WEBHOOK: { label: 'Webhook', icon: Zap },
    }
    return config[type] || config.KEYWORD
  }

  const activeCount = flows?.filter(f => f.status === 'ACTIVE').length || 0
  const draftCount = flows?.filter(f => f.status === 'DRAFT').length || 0
  const totalSessions = flows?.reduce((acc, f) => acc + (f.activeSessions || 0), 0) || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Fluxos de Automacao</h2>
          <p className="text-muted-foreground">
            Crie chatbots visuais com arrastar e soltar
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Fluxo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Fluxos</p>
                <p className="text-2xl font-bold">{flows?.length || 0}</p>
              </div>
              <Workflow className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ativos</p>
                <p className="text-2xl font-bold text-green-600">{activeCount}</p>
              </div>
              <Play className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rascunhos</p>
                <p className="text-2xl font-bold text-gray-600">{draftCount}</p>
              </div>
              <Edit className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sessoes Ativas</p>
                <p className="text-2xl font-bold text-blue-600">{totalSessions}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Flows List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5" />
            Meus Fluxos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : flows && flows.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.isArray(flows) && flows.map((flow) => {
                const statusConfig = getStatusConfig(flow.status)
                const triggerConfig = getTriggerConfig(flow.triggerType)
                const TriggerIcon = triggerConfig.icon

                return (
                  <Card
                    key={flow.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/flows/${flow.id}`)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{flow.name}</h3>
                            <Badge variant={statusConfig.variant as any}>
                              {statusConfig.label}
                            </Badge>
                          </div>
                          {flow.description && (
                            <p className="text-sm text-muted-foreground truncate mb-2">
                              {flow.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <TriggerIcon className="h-3 w-3" />
                            <span>{triggerConfig.label}</span>
                            {flow.triggerValue && (
                              <Badge variant="outline" className="text-xs">
                                {flow.triggerValue}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{flow.nodesCount || 0} nodes</span>
                            <span>{flow.activeSessions || 0} sessoes ativas</span>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/flows/${flow.id}`)
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                duplicateMutation.mutate(flow.id)
                              }}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {flow.status === 'ACTIVE' ? (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleStatusMutation.mutate({ id: flow.id, status: 'INACTIVE' })
                                }}
                              >
                                <Pause className="mr-2 h-4 w-4" />
                                Desativar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleStatusMutation.mutate({ id: flow.id, status: 'ACTIVE' })
                                }}
                              >
                                <Play className="mr-2 h-4 w-4" />
                                Ativar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (confirm('Tem certeza que deseja excluir este fluxo?')) {
                                  deleteMutation.mutate(flow.id)
                                }
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Workflow className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg mb-2">Nenhum fluxo criado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Crie seu primeiro fluxo de automacao para chatbot
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Fluxo
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Fluxo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Fluxo</Label>
              <Input
                id="name"
                placeholder="Ex: Atendimento inicial"
                value={newFlow.name}
                onChange={(e) => setNewFlow({ ...newFlow, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descricao (opcional)</Label>
              <Textarea
                id="description"
                placeholder="Descreva o objetivo deste fluxo..."
                value={newFlow.description}
                onChange={(e) => setNewFlow({ ...newFlow, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="triggerType">Tipo de Gatilho</Label>
              <Select
                value={newFlow.triggerType}
                onValueChange={(value: FlowTriggerType) =>
                  setNewFlow({ ...newFlow, triggerType: value })
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
            {newFlow.triggerType === 'KEYWORD' && (
              <div className="space-y-2">
                <Label htmlFor="triggerValue">Palavra-chave</Label>
                <Input
                  id="triggerValue"
                  placeholder="Ex: oi, ola, menu (separe por virgula)"
                  value={newFlow.triggerValue}
                  onChange={(e) => setNewFlow({ ...newFlow, triggerValue: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="instance">Instancia (opcional)</Label>
              <Select
                value={newFlow.instanceId || '__all__'}
                onValueChange={(value) => setNewFlow({ ...newFlow, instanceId: value === '__all__' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as instancias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as instancias</SelectItem>
                  {Array.isArray(instances) && instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {createError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {createError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); setCreateError(null); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate(newFlow)}
              disabled={!newFlow.name || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Criar e Editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
