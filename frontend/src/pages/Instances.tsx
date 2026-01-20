import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Smartphone,
  MoreVertical,
  Power,
  PowerOff,
  Trash2,
  RefreshCw,
  Copy,
  QrCode,
  MessageSquare,
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  Settings,
  Webhook,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import api from '@/services/api'
import { getSocket, connectSocket, joinInstance, leaveInstance } from '@/services/socket'
import type { Instance } from '@/types'

export function Instances() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null)
  const [configInstance, setConfigInstance] = useState<Instance | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [newInstance, setNewInstance] = useState({
    name: '',
    description: '',
    channel: 'BAILEYS' as 'BAILEYS' | 'CLOUD_API',
  })
  const [cloudApiConfig, setCloudApiConfig] = useState({
    wabaId: '',
    phoneNumberId: '',
    accessToken: '',
    webhookSecret: '',
    webhookUrl: '',
    webhookEvents: [] as string[],
  })

  const { data: instances, isLoading } = useQuery<Instance[]>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
    refetchInterval: 10000,
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof newInstance) => {
      const response = await api.post('/instances', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      setShowCreateModal(false)
      setNewInstance({ name: '', description: '', channel: 'BAILEYS' })
    },
  })

  const connectMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/instances/${id}/connect`)
      return response.data
    },
    onSuccess: (_, id) => {
      setSelectedInstance(instances?.find((i) => i.id === id) || null)
      setShowQRModal(true)
      joinInstance(id)
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/instances/${id}/disconnect`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })

  const logoutMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/instances/${id}/logout`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/instances/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })

  const updateCloudApiMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof cloudApiConfig }) => {
      const response = await api.put(`/instances/${id}/cloud-api-config`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      setShowConfigModal(false)
      setConfigInstance(null)
      setCloudApiConfig({ wabaId: '', phoneNumberId: '', accessToken: '', webhookSecret: '', webhookUrl: '', webhookEvents: [] })
    },
  })

  const syncTemplatesMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/instances/${id}/sync-templates`)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      alert(`Sincronização concluída: ${data.message}`)
    },
    onError: (error: any) => {
      alert(`Erro ao sincronizar: ${error.response?.data?.error || error.message}`)
    },
  })

  useEffect(() => {
    connectSocket()
    const socket = getSocket()

    socket.on('qr-code', ({ instanceId, qrCode: qr }) => {
      if (selectedInstance?.id === instanceId) {
        setQrCode(qr)
      }
    })

    socket.on('status-update', ({ instanceId, status }) => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      if (status === 'CONNECTED' && selectedInstance?.id === instanceId) {
        setShowQRModal(false)
        setQrCode(null)
      }
    })

    socket.on('qr-timeout', ({ instanceId }) => {
      if (selectedInstance?.id === instanceId) {
        setShowQRModal(false)
        setQrCode(null)
      }
    })

    return () => {
      socket.off('qr-code')
      socket.off('status-update')
      socket.off('qr-timeout')
    }
  }, [selectedInstance, queryClient])

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token)
  }

  const handleOpenConfig = (instance: Instance) => {
    setConfigInstance(instance)
    setCloudApiConfig({
      wabaId: instance.wabaId || '',
      phoneNumberId: instance.phoneNumberId || '',
      accessToken: instance.accessToken || '',
      webhookSecret: instance.webhookSecret || '',
      webhookUrl: instance.webhookUrl || '',
      webhookEvents: instance.webhookEvents || [],
    })
    setShowConfigModal(true)
  }

  const getWebhookUrl = (instanceId: string) => {
    const baseUrl = window.location.origin.replace(':5454', ':3333').replace(':5455', ':3333')
    return `${baseUrl}/api/webhook/cloud-api/${instanceId}`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return 'success'
      case 'CONNECTING':
        return 'warning'
      case 'BANNED':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return 'Conectado'
      case 'CONNECTING':
        return 'Conectando'
      case 'BANNED':
        return 'Banido'
      default:
        return 'Desconectado'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Instâncias</h2>
          <p className="text-muted-foreground">
            Gerencie suas conexões do WhatsApp
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} variant="whatsapp">
          <Plus className="mr-2 h-4 w-4" />
          Nova Instância
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.isArray(instances) && instances.map((instance) => (
            <Card key={instance.id} className="relative overflow-hidden">
              {/* Status indicator */}
              <div
                className={`absolute top-0 left-0 right-0 h-1 ${
                  instance.status === 'CONNECTED'
                    ? 'bg-green-500'
                    : instance.status === 'CONNECTING'
                    ? 'bg-yellow-500'
                    : 'bg-gray-300 dark:bg-gray-700'
                }`}
              />

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={instance.profilePicture || undefined} />
                      <AvatarFallback className="bg-whatsapp text-white">
                        <Smartphone className="h-6 w-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg">{instance.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {instance.phoneNumber || 'Não conectado'}
                      </p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {instance.channel === 'BAILEYS' && ['DISCONNECTED', 'CONNECTING'].includes(instance.status) && (
                        <DropdownMenuItem
                          onClick={() => connectMutation.mutate(instance.id)}
                        >
                          <Power className="mr-2 h-4 w-4" />
                          {instance.status === 'CONNECTING' ? 'Reconectar' : 'Conectar'}
                        </DropdownMenuItem>
                      )}
                      {instance.channel === 'BAILEYS' && instance.status === 'CONNECTED' && (
                        <>
                          <DropdownMenuItem
                            onClick={() => disconnectMutation.mutate(instance.id)}
                          >
                            <PowerOff className="mr-2 h-4 w-4" />
                            Desconectar (manter sessão)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => logoutMutation.mutate(instance.id)}
                            className="text-orange-600"
                          >
                            <LogOut className="mr-2 h-4 w-4" />
                            Logout (trocar WhatsApp)
                          </DropdownMenuItem>
                        </>
                      )}
                      {instance.channel === 'CLOUD_API' && instance.status === 'CONNECTED' && (
                        <DropdownMenuItem
                          onClick={() => disconnectMutation.mutate(instance.id)}
                        >
                          <PowerOff className="mr-2 h-4 w-4" />
                          Desconectar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleCopyToken(instance.apiToken)}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copiar Token
                      </DropdownMenuItem>
                      {instance.channel === 'CLOUD_API' && (
                        <>
                          <DropdownMenuItem
                            onClick={() => handleOpenConfig(instance)}
                          >
                            <Settings className="mr-2 h-4 w-4" />
                            Configurar Cloud API
                          </DropdownMenuItem>
                          {instance.status === 'CONNECTED' && (
                            <DropdownMenuItem
                              onClick={() => syncTemplatesMutation.mutate(instance.id)}
                              disabled={syncTemplatesMutation.isPending}
                            >
                              <RefreshCw className={`mr-2 h-4 w-4 ${syncTemplatesMutation.isPending ? 'animate-spin' : ''}`} />
                              Sincronizar Templates
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(instance.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant={getStatusColor(instance.status) as any}>
                    {getStatusLabel(instance.status)}
                  </Badge>
                  <Badge variant="outline">
                    {instance.channel === 'BAILEYS' ? 'Baileys' : 'Cloud API'}
                  </Badge>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">{instance.messagesSent}</p>
                      <p className="text-xs text-muted-foreground">Enviadas</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowDownCircle className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">{instance.messagesReceived}</p>
                      <p className="text-xs text-muted-foreground">Recebidas</p>
                    </div>
                  </div>
                </div>

                {/* Webhook URL for Cloud API */}
                {instance.channel === 'CLOUD_API' && (
                  <div className="pt-2 border-t">
                    <Label className="text-xs flex items-center gap-1 mb-1">
                      <Webhook className="h-3 w-3" />
                      Webhook URL (para Meta)
                    </Label>
                    <div className="flex gap-1">
                      <Input
                        readOnly
                        value={getWebhookUrl(instance.id)}
                        className="bg-muted text-xs h-8"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(getWebhookUrl(instance.id))
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {instance.channel === 'BAILEYS' && ['DISCONNECTED', 'CONNECTING'].includes(instance.status) && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => connectMutation.mutate(instance.id)}
                    disabled={connectMutation.isPending}
                  >
                    {connectMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <QrCode className="mr-2 h-4 w-4" />
                    )}
                    {instance.status === 'CONNECTING' ? 'Reconectar via QR Code' : 'Conectar via QR Code'}
                  </Button>
                )}
                {instance.channel === 'CLOUD_API' && instance.status === 'DISCONNECTED' && (
                  <p className="text-sm text-muted-foreground text-center">
                    Configure as credenciais da Meta nas configurações
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          {instances?.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Smartphone className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg mb-2">Nenhuma instância</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Crie sua primeira instância para começar a enviar mensagens
                </p>
                <Button onClick={() => setShowCreateModal(true)} variant="whatsapp">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Instância
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create Instance Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Instância</DialogTitle>
            <DialogDescription>
              Configure uma nova conexão do WhatsApp
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Minha Instância"
                value={newInstance.name}
                onChange={(e) =>
                  setNewInstance({ ...newInstance, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Input
                id="description"
                placeholder="Instância para atendimento"
                value={newInstance.description}
                onChange={(e) =>
                  setNewInstance({ ...newInstance, description: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="channel">Canal</Label>
              <Select
                value={newInstance.channel}
                onValueChange={(value: 'BAILEYS' | 'CLOUD_API') =>
                  setNewInstance({ ...newInstance, channel: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAILEYS">Baileys (QR Code)</SelectItem>
                  <SelectItem value="CLOUD_API">Cloud API (Meta)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="whatsapp"
              onClick={() => createMutation.mutate(newInstance)}
              disabled={!newInstance.name || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      <Dialog open={showQRModal} onOpenChange={(open) => {
        setShowQRModal(open)
        if (!open && selectedInstance) {
          leaveInstance(selectedInstance.id)
          setSelectedInstance(null)
          setQrCode(null)
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escanear QR Code</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no seu celular e escaneie o QR Code
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center py-6">
            {qrCode ? (
              <img src={qrCode} alt="QR Code" className="w-64 h-64" />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground">
            O QR Code expira em 60 segundos. Aguardando leitura...
          </p>
        </DialogContent>
      </Dialog>

      {/* Cloud API Config Modal */}
      <Dialog open={showConfigModal} onOpenChange={(open) => {
        setShowConfigModal(open)
        if (!open) {
          setConfigInstance(null)
          setCloudApiConfig({ wabaId: '', phoneNumberId: '', accessToken: '', webhookSecret: '', webhookUrl: '', webhookEvents: [] })
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurar Cloud API
            </DialogTitle>
            <DialogDescription>
              Configure as credenciais da Meta para a instância {configInstance?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wabaId">WABA ID (WhatsApp Business Account ID)</Label>
              <Input
                id="wabaId"
                placeholder="123456789012345"
                value={cloudApiConfig.wabaId}
                onChange={(e) =>
                  setCloudApiConfig({ ...cloudApiConfig, wabaId: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Encontre no Meta Business Suite → WhatsApp Manager → Configurações
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumberId">Phone Number ID</Label>
              <Input
                id="phoneNumberId"
                placeholder="123456789012345"
                value={cloudApiConfig.phoneNumberId}
                onChange={(e) =>
                  setCloudApiConfig({ ...cloudApiConfig, phoneNumberId: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                ID do número de telefone vinculado à sua conta
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessToken">Access Token (Permanente)</Label>
              <Input
                id="accessToken"
                type="password"
                placeholder="EAAxxxxxxx..."
                value={cloudApiConfig.accessToken}
                onChange={(e) =>
                  setCloudApiConfig({ ...cloudApiConfig, accessToken: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Token de acesso permanente gerado no painel de desenvolvedores da Meta
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookSecret">Webhook Verify Token</Label>
              <Input
                id="webhookSecret"
                placeholder="seu_token_secreto"
                value={cloudApiConfig.webhookSecret}
                onChange={(e) =>
                  setCloudApiConfig({ ...cloudApiConfig, webhookSecret: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Token para verificação do webhook (você define)
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <Label className="flex items-center gap-2">
                <Webhook className="h-4 w-4" />
                URL do Webhook (configure na Meta)
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={configInstance ? getWebhookUrl(configInstance.id) : ''}
                  className="bg-muted"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (configInstance) {
                      navigator.clipboard.writeText(getWebhookUrl(configInstance.id))
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure esta URL no Meta Business Suite → WhatsApp → Configuração → Webhook
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <Label className="flex items-center gap-2">
                <Webhook className="h-4 w-4" />
                Webhook de Notificação (receber eventos)
              </Label>
              <Input
                placeholder="https://seu-servidor.com/webhook"
                value={cloudApiConfig.webhookUrl || ''}
                onChange={(e) =>
                  setCloudApiConfig({ ...cloudApiConfig, webhookUrl: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                URL para receber notificações de mensagens enviadas/recebidas
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={cloudApiConfig.webhookEvents?.includes('message.sent') || false}
                    onChange={(e) => {
                      const events = cloudApiConfig.webhookEvents || []
                      if (e.target.checked) {
                        setCloudApiConfig({ ...cloudApiConfig, webhookEvents: [...events, 'message.sent'] })
                      } else {
                        setCloudApiConfig({ ...cloudApiConfig, webhookEvents: events.filter(ev => ev !== 'message.sent') })
                      }
                    }}
                  />
                  message.sent
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={cloudApiConfig.webhookEvents?.includes('message.received') || false}
                    onChange={(e) => {
                      const events = cloudApiConfig.webhookEvents || []
                      if (e.target.checked) {
                        setCloudApiConfig({ ...cloudApiConfig, webhookEvents: [...events, 'message.received'] })
                      } else {
                        setCloudApiConfig({ ...cloudApiConfig, webhookEvents: events.filter(ev => ev !== 'message.received') })
                      }
                    }}
                  />
                  message.received
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="whatsapp"
              onClick={() => {
                if (configInstance) {
                  updateCloudApiMutation.mutate({ id: configInstance.id, data: cloudApiConfig })
                }
              }}
              disabled={!cloudApiConfig.phoneNumberId || !cloudApiConfig.accessToken || updateCloudApiMutation.isPending}
            >
              {updateCloudApiMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar Configuração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
