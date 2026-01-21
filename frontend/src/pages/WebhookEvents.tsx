import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Webhook,
  Search,
  RefreshCw,
  Eye,
  Send,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Copy,
  Phone,
  Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Textarea } from '@/components/ui/textarea'
import api from '@/services/api'
import type { WebhookEvent, Instance, MessageTemplate } from '@/types'

const statusConfig = {
  PENDING: { label: 'Pendente', color: 'bg-yellow-500', icon: Clock },
  PROCESSED: { label: 'Processado', color: 'bg-green-500', icon: CheckCircle },
  ERROR: { label: 'Erro', color: 'bg-red-500', icon: XCircle },
  IGNORED: { label: 'Ignorado', color: 'bg-gray-500', icon: AlertCircle },
}

export function WebhookEvents() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [showDirectSendModal, setShowDirectSendModal] = useState(false)
  const [applyData, setApplyData] = useState({
    templateId: '',
    instanceId: '',
  })
  const [directSendData, setDirectSendData] = useState({
    instanceId: '',
    phoneNumber: '',
    message: '',
  })

  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['webhook-events', statusFilter],
    queryFn: async () => {
      const params: any = { limit: 100 }
      if (statusFilter !== 'all') params.status = statusFilter
      const response = await api.get('/webhook-entrada/events', { params })
      return response.data
    },
    refetchInterval: 5000,
  })

  const { data: stats } = useQuery({
    queryKey: ['webhook-events-stats'],
    queryFn: async () => {
      const response = await api.get('/webhook-entrada/stats')
      return response.data
    },
    refetchInterval: 10000,
  })

  const { data: webhookInfo } = useQuery({
    queryKey: ['webhook-info'],
    queryFn: async () => {
      const response = await api.get('/webhook-entrada/info')
      return response.data
    },
  })

  const { data: instances } = useQuery({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  const { data: templates } = useQuery({
    queryKey: ['message-templates'],
    queryFn: async () => {
      const response = await api.get('/message-templates')
      return response.data
    },
  })

  const applyTemplateMutation = useMutation({
    mutationFn: async (data: { eventId: string; templateId: string; instanceId: string }) => {
      return api.post(`/webhook-entrada/events/${data.eventId}/apply-template`, {
        templateId: data.templateId,
        instanceId: data.instanceId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-events'] })
      setShowApplyModal(false)
      setSelectedEvent(null)
    },
  })

  const directSendMutation = useMutation({
    mutationFn: async (data: { eventId: string; instanceId: string; phoneNumber: string; message: string }) => {
      return api.post(`/webhook-entrada/events/${data.eventId}/send`, {
        instanceId: data.instanceId,
        phoneNumber: data.phoneNumber,
        message: data.message,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-events'] })
      setShowDirectSendModal(false)
      setSelectedEvent(null)
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async (data: { eventId: string; status: string }) => {
      return api.patch(`/webhook-entrada/events/${data.eventId}/status`, {
        status: data.status,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-events'] })
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const openApplyModal = (event: WebhookEvent) => {
    setSelectedEvent(event)
    setDirectSendData({
      instanceId: '',
      phoneNumber: event.phoneNumber || '',
      message: '',
    })
    setShowApplyModal(true)
  }

  const openDirectSendModal = (event: WebhookEvent) => {
    setSelectedEvent(event)
    setDirectSendData({
      instanceId: '',
      phoneNumber: event.phoneNumber || '',
      message: '',
    })
    setShowDirectSendModal(true)
  }

  const events = eventsData?.events || []
  const baileysInstances = (instances || []).filter(
    (i: Instance) => i.channel === 'BAILEYS' && i.status === 'CONNECTED'
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Webhook de Entrada</h2>
          <p className="text-muted-foreground">
            Receba dados externos e dispare mensagens automaticamente
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['webhook-events'] })}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Webhook URL Info */}
      {webhookInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5" />
              URL do Webhook
            </CardTitle>
            <CardDescription>
              Use esta URL para enviar dados para o sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                {webhookInfo.webhookUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookInfo.webhookUrl)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Método: POST | Content-Type: application/json
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total de Eventos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">{stats.processed}</div>
              <p className="text-xs text-muted-foreground">Processados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-500">{stats.error}</div>
              <p className="text-xs text-muted-foreground">Erros</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-500">{stats.todayCount}</div>
              <p className="text-xs text-muted-foreground">Hoje</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PENDING">Pendentes</SelectItem>
            <SelectItem value="PROCESSED">Processados</SelectItem>
            <SelectItem value="ERROR">Erros</SelectItem>
            <SelectItem value="IGNORED">Ignorados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Events List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {events.map((event: WebhookEvent) => {
                const config = statusConfig[event.status]
                const StatusIcon = config.icon
                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full ${config.color} flex items-center justify-center`}>
                        <StatusIcon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{event.eventType || 'webhook'}</p>
                          <Badge variant="secondary">{event.status}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {event.phoneNumber && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {event.phoneNumber}
                            </span>
                          )}
                          <span>{new Date(event.createdAt).toLocaleString()}</span>
                          <span className="text-xs">{event.ipAddress}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEvent(event)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {event.status === 'PENDING' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openApplyModal(event)}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Template
                          </Button>
                          {event.phoneNumber && (
                            <Button
                              variant="whatsapp"
                              size="sm"
                              onClick={() => openDirectSendModal(event)}
                            >
                              <Send className="mr-2 h-4 w-4" />
                              Enviar
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}

              {events.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium text-lg mb-2">Nenhum evento</h3>
                  <p className="text-muted-foreground text-center">
                    Envie dados para a URL do webhook para começar
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Event Modal */}
      <Dialog open={!!selectedEvent && !showApplyModal && !showDirectSendModal} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Evento</DialogTitle>
            <DialogDescription>
              ID: {selectedEvent?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <p className="font-medium">{selectedEvent.status}</p>
                </div>
                <div>
                  <Label>Tipo</Label>
                  <p className="font-medium">{selectedEvent.eventType || 'N/A'}</p>
                </div>
                <div>
                  <Label>Telefone</Label>
                  <p className="font-medium">{selectedEvent.phoneNumber || 'Não detectado'}</p>
                </div>
                <div>
                  <Label>IP</Label>
                  <p className="font-medium">{selectedEvent.ipAddress}</p>
                </div>
                <div>
                  <Label>Recebido em</Label>
                  <p className="font-medium">
                    {new Date(selectedEvent.createdAt).toLocaleString()}
                  </p>
                </div>
                {selectedEvent.processedAt && (
                  <div>
                    <Label>Processado em</Label>
                    <p className="font-medium">
                      {new Date(selectedEvent.processedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {selectedEvent.variables && selectedEvent.variables.length > 0 && (
                <div>
                  <Label>Variáveis Extraídas</Label>
                  <div className="mt-2 space-y-1">
                    {selectedEvent.variables.map((v) => (
                      <div key={v.id} className="flex justify-between p-2 bg-muted rounded text-sm">
                        <span className="font-mono">{`{{${v.key}}}`}</span>
                        <span className="text-muted-foreground truncate max-w-[300px]">
                          {v.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label>Payload Raw</Label>
                <pre className="mt-2 p-4 bg-muted rounded text-sm overflow-auto max-h-60">
                  {JSON.stringify(selectedEvent.rawPayload, null, 2)}
                </pre>
              </div>

              {selectedEvent.errorMessage && (
                <div>
                  <Label>Erro</Label>
                  <p className="text-red-500">{selectedEvent.errorMessage}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedEvent?.status === 'PENDING' && (
              <Button
                variant="outline"
                onClick={() => updateStatusMutation.mutate({
                  eventId: selectedEvent.id,
                  status: 'IGNORED',
                })}
              >
                Ignorar
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedEvent(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Template Modal */}
      <Dialog open={showApplyModal} onOpenChange={setShowApplyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar Template</DialogTitle>
            <DialogDescription>
              Selecione um template e instância para enviar a mensagem
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Instância</Label>
              <Select
                value={applyData.instanceId}
                onValueChange={(v) => setApplyData({ ...applyData, instanceId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma instância" />
                </SelectTrigger>
                <SelectContent>
                  {(instances || []).filter((i: Instance) => i.status === 'CONNECTED').map((instance: Instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name} ({instance.channel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={applyData.templateId}
                onValueChange={(v) => setApplyData({ ...applyData, templateId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {(templates || []).map((template: MessageTemplate) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.channelType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEvent?.phoneNumber && (
              <div>
                <Label>Telefone</Label>
                <p className="font-medium">{selectedEvent.phoneNumber}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="whatsapp"
              onClick={() => {
                if (selectedEvent && applyData.templateId && applyData.instanceId) {
                  applyTemplateMutation.mutate({
                    eventId: selectedEvent.id,
                    templateId: applyData.templateId,
                    instanceId: applyData.instanceId,
                  })
                }
              }}
              disabled={!applyData.templateId || !applyData.instanceId || applyTemplateMutation.isPending}
            >
              {applyTemplateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar e Enfileirar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Direct Send Modal */}
      <Dialog open={showDirectSendModal} onOpenChange={setShowDirectSendModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Envio Direto (Baileys)</DialogTitle>
            <DialogDescription>
              Envie uma mensagem diretamente via Baileys
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Instância (Baileys)</Label>
              <Select
                value={directSendData.instanceId}
                onValueChange={(v) => setDirectSendData({ ...directSendData, instanceId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma instância Baileys" />
                </SelectTrigger>
                <SelectContent>
                  {baileysInstances.map((instance: Instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={directSendData.phoneNumber}
                onChange={(e) => setDirectSendData({ ...directSendData, phoneNumber: e.target.value })}
                placeholder="5511999999999"
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={directSendData.message}
                onChange={(e) => setDirectSendData({ ...directSendData, message: e.target.value })}
                placeholder="Digite sua mensagem..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDirectSendModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="whatsapp"
              onClick={() => {
                if (selectedEvent && directSendData.instanceId && directSendData.phoneNumber && directSendData.message) {
                  directSendMutation.mutate({
                    eventId: selectedEvent.id,
                    instanceId: directSendData.instanceId,
                    phoneNumber: directSendData.phoneNumber,
                    message: directSendData.message,
                  })
                }
              }}
              disabled={
                !directSendData.instanceId ||
                !directSendData.phoneNumber ||
                !directSendData.message ||
                directSendMutation.isPending
              }
            >
              {directSendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
