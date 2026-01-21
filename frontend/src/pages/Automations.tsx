import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap,
  Plus,
  Play,
  Pause,
  Trash2,
  Copy,
  Eye,
  RefreshCw,
  Loader2,
  Settings,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import api from '@/services/api'
import type { Automation, AutomationLog, Instance, MetaTemplate } from '@/types'

const statusConfig = {
  QUEUED: { label: 'Na Fila', color: 'bg-yellow-500', icon: Clock },
  PROCESSING: { label: 'Processando', color: 'bg-blue-500', icon: Loader2 },
  SENT: { label: 'Enviado', color: 'bg-green-500', icon: CheckCircle },
  FAILED: { label: 'Falhou', color: 'bg-red-500', icon: XCircle },
}

export function Automations() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEndpointModal, setShowEndpointModal] = useState(false)
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    instanceId: '',
    phoneField: 'telefone',
    metaTemplateName: '',
    metaTemplateLanguage: 'pt_BR',
    messageText: '',
    delayBetweenMessages: 3000,
  })

  // Fetch automations
  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const response = await api.get('/automations')
      return response.data
    },
  })

  // Fetch instances
  const { data: instances = [] } = useQuery({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  // Fetch available variables
  const { data: variablesData } = useQuery({
    queryKey: ['webhook-variables'],
    queryFn: async () => {
      const response = await api.get('/webhook-entrada/variables')
      return response.data
    },
  })

  // Fetch Meta templates for selected instance
  const selectedInstance = instances.find((i: Instance) => i.id === formData.instanceId)
  const { data: metaTemplates = [] } = useQuery({
    queryKey: ['meta-templates', formData.instanceId],
    queryFn: async () => {
      const response = await api.get(`/automations/meta-templates/${formData.instanceId}`)
      return response.data
    },
    enabled: !!formData.instanceId && selectedInstance?.channel === 'CLOUD_API',
  })

  // Fetch endpoint info
  const { data: endpointInfo } = useQuery({
    queryKey: ['automation-endpoint', selectedAutomation?.id],
    queryFn: async () => {
      const response = await api.get(`/automations/${selectedAutomation?.id}/endpoint`)
      return response.data
    },
    enabled: !!selectedAutomation && showEndpointModal,
  })

  // Fetch automation logs
  const { data: logsData } = useQuery({
    queryKey: ['automation-logs', selectedAutomation?.id],
    queryFn: async () => {
      const response = await api.get(`/automations/${selectedAutomation?.id}/logs`)
      return response.data
    },
    enabled: !!selectedAutomation && showLogsModal,
  })

  // Create automation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return api.post('/automations', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      setShowCreateModal(false)
      resetForm()
    },
  })

  // Update automation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return api.put(`/automations/${id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      setShowCreateModal(false)
      setSelectedAutomation(null)
      resetForm()
    },
  })

  // Toggle automation
  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.patch(`/automations/${id}/toggle`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
    },
  })

  // Delete automation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/automations/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
    },
  })

  // Regenerate token
  const regenerateTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/automations/${id}/regenerate-token`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      queryClient.invalidateQueries({ queryKey: ['automation-endpoint'] })
    },
  })

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      instanceId: '',
      phoneField: 'telefone',
      metaTemplateName: '',
      metaTemplateLanguage: 'pt_BR',
      messageText: '',
      delayBetweenMessages: 3000,
    })
  }

  const openEditModal = (automation: Automation) => {
    setSelectedAutomation(automation)
    setFormData({
      name: automation.name,
      description: automation.description || '',
      instanceId: automation.instanceId,
      phoneField: automation.phoneField,
      metaTemplateName: automation.metaTemplateName || '',
      metaTemplateLanguage: automation.metaTemplateLanguage || 'pt_BR',
      messageText: automation.messageBody?.text || '',
      delayBetweenMessages: automation.delayBetweenMessages,
    })
    setShowCreateModal(true)
  }

  const handleSubmit = () => {
    const instance = instances.find((i: Instance) => i.id === formData.instanceId)
    const data: any = {
      name: formData.name,
      description: formData.description || undefined,
      instanceId: formData.instanceId,
      phoneField: formData.phoneField,
      delayBetweenMessages: formData.delayBetweenMessages,
    }

    if (instance?.channel === 'CLOUD_API') {
      data.metaTemplateName = formData.metaTemplateName
      data.metaTemplateLanguage = formData.metaTemplateLanguage
    } else {
      data.messageBody = { text: formData.messageText }
    }

    if (selectedAutomation) {
      updateMutation.mutate({ id: selectedAutomation.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const variables = variablesData?.variables || []
  const suggestedPhoneFields = variablesData?.suggestedPhoneFields || []
  const connectedInstances = instances.filter((i: Instance) => i.status === 'CONNECTED')
  const logs = logsData?.logs || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Automacoes</h2>
          <p className="text-muted-foreground">
            Crie endpoints para disparar mensagens automaticamente
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['automations'] })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button onClick={() => {
            resetForm()
            setSelectedAutomation(null)
            setShowCreateModal(true)
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Automacao
          </Button>
        </div>
      </div>

      {/* Automations List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : automations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Zap className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">Nenhuma automacao</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crie sua primeira automacao para disparar mensagens automaticamente
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Automacao
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {automations.map((automation: Automation) => (
            <Card key={automation.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{automation.name}</CardTitle>
                  <Badge variant={automation.status === 'ACTIVE' ? 'default' : 'secondary'}>
                    {automation.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <CardDescription>
                  {automation.instance?.name} ({automation.instance?.channel})
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {automation.description && (
                  <p className="text-sm text-muted-foreground">{automation.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Enviados:</span>
                    <span className="ml-1 font-medium text-green-500">{automation.totalSent}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Falhas:</span>
                    <span className="ml-1 font-medium text-red-500">{automation.totalFailed}</span>
                  </div>
                </div>

                {automation.lastTriggeredAt && (
                  <p className="text-xs text-muted-foreground">
                    Ultimo disparo: {new Date(automation.lastTriggeredAt).toLocaleString()}
                  </p>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMutation.mutate(automation.id)}
                    disabled={toggleMutation.isPending}
                  >
                    {automation.status === 'ACTIVE' ? (
                      <><Pause className="h-4 w-4 mr-1" /> Pausar</>
                    ) : (
                      <><Play className="h-4 w-4 mr-1" /> Ativar</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedAutomation(automation)
                      setShowEndpointModal(true)
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Endpoint
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedAutomation(automation)
                      setShowLogsModal(true)
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Logs
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(automation)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm('Deseja excluir esta automacao?')) {
                        deleteMutation.mutate(automation.id)
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedAutomation ? 'Editar Automacao' : 'Nova Automacao'}
            </DialogTitle>
            <DialogDescription>
              Configure o disparo automatico de mensagens
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Cobranca Automatica"
                />
              </div>
              <div className="space-y-2">
                <Label>Instancia *</Label>
                <Select
                  value={formData.instanceId}
                  onValueChange={(v) => setFormData({ ...formData, instanceId: v, metaTemplateName: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma instancia" />
                  </SelectTrigger>
                  <SelectContent>
                    {connectedInstances.map((instance: Instance) => (
                      <SelectItem key={instance.id} value={instance.id}>
                        {instance.name} ({instance.channel})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descricao</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descricao opcional da automacao"
                rows={2}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Campo de Telefone *</Label>
                <Select
                  value={formData.phoneField}
                  onValueChange={(v) => setFormData({ ...formData, phoneField: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Campo do telefone" />
                  </SelectTrigger>
                  <SelectContent>
                    {suggestedPhoneFields.map((field: string) => (
                      <SelectItem key={field} value={field}>
                        {field} (sugerido)
                      </SelectItem>
                    ))}
                    {variables
                      .filter((v: any) => !suggestedPhoneFields.includes(v.key))
                      .slice(0, 20)
                      .map((v: any) => (
                        <SelectItem key={v.key} value={v.key}>
                          {v.key}
                        </SelectItem>
                      ))}
                    <SelectItem value="telefone">telefone</SelectItem>
                    <SelectItem value="phone">phone</SelectItem>
                    <SelectItem value="celular">celular</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Campo do payload que contem o telefone de destino
                </p>
              </div>
              <div className="space-y-2">
                <Label>Intervalo entre mensagens (ms)</Label>
                <Input
                  type="number"
                  value={formData.delayBetweenMessages}
                  onChange={(e) => setFormData({ ...formData, delayBetweenMessages: parseInt(e.target.value) || 3000 })}
                  min={1000}
                />
              </div>
            </div>

            {/* Cloud API - Template Selection */}
            {selectedInstance?.channel === 'CLOUD_API' && (
              <div className="space-y-4 p-4 border rounded-lg bg-blue-500/5">
                <h4 className="font-medium">Configuracao Cloud API</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Template Meta *</Label>
                    <Select
                      value={formData.metaTemplateName}
                      onValueChange={(v) => setFormData({ ...formData, metaTemplateName: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um template" />
                      </SelectTrigger>
                      <SelectContent>
                        {metaTemplates.map((template: MetaTemplate) => (
                          <SelectItem key={template.name} value={template.name}>
                            {template.name} ({template.category})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Apenas templates aprovados pela Meta
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma</Label>
                    <Select
                      value={formData.metaTemplateLanguage}
                      onValueChange={(v) => setFormData({ ...formData, metaTemplateLanguage: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt_BR">Portugues (BR)</SelectItem>
                        <SelectItem value="en_US">Ingles (US)</SelectItem>
                        <SelectItem value="es">Espanhol</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Baileys - Message Text */}
            {selectedInstance?.channel === 'BAILEYS' && (
              <div className="space-y-4 p-4 border rounded-lg bg-green-500/5">
                <h4 className="font-medium">Configuracao Baileys</h4>
                <div className="space-y-2">
                  <Label>Mensagem *</Label>
                  <Textarea
                    value={formData.messageText}
                    onChange={(e) => setFormData({ ...formData, messageText: e.target.value })}
                    placeholder="Ola {{nome}}, sua cobranca de R$ {{valor}} vence em {{vencimento}}."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {'{{variavel}}'} para inserir valores dinamicos
                  </p>
                </div>

                {variables.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm">Variaveis disponiveis</Label>
                    <div className="flex gap-1 flex-wrap">
                      {variables.slice(0, 15).map((v: any) => (
                        <Badge
                          key={v.key}
                          variant="outline"
                          className="font-mono text-xs cursor-pointer"
                          onClick={() => copyToClipboard(v.placeholder)}
                        >
                          {v.placeholder}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.name ||
                !formData.instanceId ||
                createMutation.isPending ||
                updateMutation.isPending ||
                (selectedInstance?.channel === 'CLOUD_API' && !formData.metaTemplateName) ||
                (selectedInstance?.channel === 'BAILEYS' && !formData.messageText)
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedAutomation ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Endpoint Modal */}
      <Dialog open={showEndpointModal} onOpenChange={setShowEndpointModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Endpoint da Automacao</DialogTitle>
            <DialogDescription>
              Use esta URL para disparar mensagens
            </DialogDescription>
          </DialogHeader>

          {endpointInfo && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>URL do Endpoint</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded text-sm break-all">
                    {endpointInfo.triggerUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(endpointInfo.triggerUrl)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Metodo</Label>
                  <p className="font-medium">POST</p>
                </div>
                <div>
                  <Label>Campo de Telefone</Label>
                  <p className="font-medium">{endpointInfo.phoneField}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Exemplo de Payload</Label>
                <pre className="p-3 bg-muted rounded text-sm overflow-auto">
                  {JSON.stringify(endpointInfo.example, null, 2)}
                </pre>
              </div>

              <div className="space-y-2">
                <Label>Exemplo cURL</Label>
                <pre className="p-3 bg-muted rounded text-xs overflow-auto whitespace-pre-wrap">
                  {endpointInfo.curlExample}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(endpointInfo.curlExample)}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copiar cURL
                </Button>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm('Gerar novo token? A URL anterior deixara de funcionar.')) {
                      regenerateTokenMutation.mutate(selectedAutomation!.id)
                    }
                  }}
                  disabled={regenerateTokenMutation.isPending}
                >
                  {regenerateTokenMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-1" />
                  )}
                  Regenerar Token
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEndpointModal(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Modal */}
      <Dialog open={showLogsModal} onOpenChange={setShowLogsModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Logs de Disparo</DialogTitle>
            <DialogDescription>
              Historico de mensagens enviadas por esta automacao
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Send className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Nenhum disparo registrado</p>
              </div>
            ) : (
              logs.map((log: AutomationLog) => {
                const config = statusConfig[log.status]
                const StatusIcon = config.icon
                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full ${config.color} flex items-center justify-center`}>
                        <StatusIcon className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="font-medium">{log.phoneNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={log.status === 'SENT' ? 'default' : 'destructive'}>
                        {config.label}
                      </Badge>
                      {log.errorMessage && (
                        <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate">
                          {log.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogsModal(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
