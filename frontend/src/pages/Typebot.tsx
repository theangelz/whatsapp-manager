import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  Plus,
  Settings,
  Power,
  Trash2,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/services/api'
import type { Instance, TypebotIntegration } from '@/types'

interface ConflictingFlow {
  id: string
  name: string
  isGlobal: boolean
  triggerType: string
}

export function Typebot() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [showConflictModal, setShowConflictModal] = useState(false)
  const [conflictingFlows, setConflictingFlows] = useState<ConflictingFlow[]>([])
  const [pendingAction, setPendingAction] = useState<{ type: 'create' | 'toggle'; instanceId: string } | null>(null)
  const [formData, setFormData] = useState({
    instanceId: '',
    typebotId: '',
    typebotUrl: '',
    triggerType: 'all' as 'all' | 'keyword' | 'new_conversation',
    triggerValue: '',
  })

  const { data: instances } = useQuery<Instance[]>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  const configuredInstances = instances?.filter((i) => i.id) || []

  const getIntegration = async (instanceId: string) => {
    try {
      const response = await api.get(`/typebot/${instanceId}`)
      return response.data
    } catch {
      return null
    }
  }

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { disableConflictingFlows?: boolean }) => {
      return api.post('/typebot', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      setShowModal(false)
      setShowConflictModal(false)
      setPendingAction(null)
      setFormData({
        instanceId: '',
        typebotId: '',
        typebotUrl: '',
        triggerType: 'all',
        triggerValue: '',
      })
    },
    onError: (error: any) => {
      if (error.response?.status === 409) {
        const data = error.response.data
        setConflictingFlows(data.conflictingFlows || [])
        setPendingAction({ type: 'create', instanceId: formData.instanceId })
        setShowConflictModal(true)
      }
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ instanceId, disableConflictingFlows }: { instanceId: string; disableConflictingFlows?: boolean }) => {
      return api.post(`/typebot/${instanceId}/toggle`, { disableConflictingFlows })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      setShowConflictModal(false)
      setPendingAction(null)
    },
    onError: (error: any, variables) => {
      if (error.response?.status === 409) {
        const data = error.response.data
        setConflictingFlows(data.conflictingFlows || [])
        setPendingAction({ type: 'toggle', instanceId: variables.instanceId })
        setShowConflictModal(true)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      return api.delete(`/typebot/${instanceId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Typebot</h2>
          <p className="text-muted-foreground">
            Configure integrações com Typebot por instância
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} variant="whatsapp">
          <Plus className="mr-2 h-4 w-4" />
          Nova Integração
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.isArray(instances) && instances.map((instance) => (
          <Card key={instance.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-purple-600 dark:text-purple-300" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{instance.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {instance.phoneNumber || 'Não conectado'}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={
                    instance.status === 'CONNECTED' ? 'success' : 'secondary'
                  }
                >
                  {instance.status === 'CONNECTED' ? 'Online' : 'Offline'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Typebot</span>
                  </div>
                  {(instance as any).typebotIntegration ? (
                    <Badge variant={(instance as any).typebotIntegration.isActive ? 'success' : 'secondary'}>
                      {(instance as any).typebotIntegration.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Não configurado</Badge>
                  )}
                </div>

                {(instance as any).typebotIntegration && (
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    <p className="truncate">URL: {(instance as any).typebotIntegration.typebotUrl}</p>
                    <p>ID: {(instance as any).typebotIntegration.typebotId}</p>
                    <p>Gatilho: {(instance as any).typebotIntegration.triggerType}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => {
                      const integration = (instance as any).typebotIntegration
                      setFormData({
                        instanceId: instance.id,
                        typebotId: integration?.typebotId || '',
                        typebotUrl: integration?.typebotUrl || '',
                        triggerType: integration?.triggerType || 'all',
                        triggerValue: integration?.triggerValue || '',
                      })
                      setShowModal(true)
                    }}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    {(instance as any).typebotIntegration ? 'Editar' : 'Configurar'}
                  </Button>
                  {(instance as any).typebotIntegration && (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => toggleMutation.mutate({ instanceId: instance.id })}
                        disabled={toggleMutation.isPending}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (confirm('Tem certeza que deseja remover esta integração?')) {
                            deleteMutation.mutate(instance.id)
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {instances?.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bot className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg mb-2">Nenhuma instância</h3>
              <p className="text-muted-foreground text-center">
                Crie uma instância primeiro para configurar integrações
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Configure Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Typebot</DialogTitle>
            <DialogDescription>
              Vincule um Typebot a esta instância
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Instância</Label>
              <Select
                value={formData.instanceId}
                onValueChange={(value) =>
                  setFormData({ ...formData, instanceId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma instância" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(instances) && instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>URL do Typebot</Label>
              <Input
                placeholder="https://typebot.io"
                value={formData.typebotUrl}
                onChange={(e) =>
                  setFormData({ ...formData, typebotUrl: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>ID do Typebot</Label>
              <Input
                placeholder="cl..."
                value={formData.typebotId}
                onChange={(e) =>
                  setFormData({ ...formData, typebotId: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Gatilho</Label>
              <Select
                value={formData.triggerType}
                onValueChange={(value: 'all' | 'keyword' | 'new_conversation') =>
                  setFormData({ ...formData, triggerType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as mensagens</SelectItem>
                  <SelectItem value="keyword">Palavra-chave</SelectItem>
                  <SelectItem value="new_conversation">Nova conversa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.triggerType === 'keyword' && (
              <div className="space-y-2">
                <Label>Palavra-chave</Label>
                <Input
                  placeholder="menu, ajuda, etc"
                  value={formData.triggerValue}
                  onChange={(e) =>
                    setFormData({ ...formData, triggerValue: e.target.value })
                  }
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="whatsapp"
              onClick={() => createMutation.mutate(formData)}
              disabled={
                !formData.instanceId ||
                !formData.typebotUrl ||
                !formData.typebotId ||
                createMutation.isPending
              }
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict Dialog */}
      <Dialog open={showConflictModal} onOpenChange={setShowConflictModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
              Conflito Detectado
            </DialogTitle>
            <DialogDescription>
              Existem Flows ativos que podem conflitar com o Typebot. O Flow nativo tem prioridade sobre o Typebot.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">Flows Ativos</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Os seguintes flows estão ativos e serão processados antes do Typebot:
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {conflictingFlows.map((flow) => (
                <div
                  key={flow.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div>
                    <p className="font-medium">{flow.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Gatilho: {flow.triggerType} {flow.isGlobal ? '(Global)' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              Para que o Typebot funcione, você pode desativar os Flows conflitantes automaticamente.
            </p>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowConflictModal(false)
                setPendingAction(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingAction?.type === 'create') {
                  createMutation.mutate({ ...formData, disableConflictingFlows: true })
                } else if (pendingAction?.type === 'toggle') {
                  toggleMutation.mutate({
                    instanceId: pendingAction.instanceId,
                    disableConflictingFlows: true,
                  })
                }
              }}
              disabled={createMutation.isPending || toggleMutation.isPending}
            >
              {(createMutation.isPending || toggleMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Desativar Flows e Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
