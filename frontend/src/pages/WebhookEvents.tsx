import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Webhook,
  RefreshCw,
  Eye,
  Trash2,
  Loader2,
  Copy,
  Globe,
  Key,
  Shield,
  ShieldOff,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import api from '@/services/api'
import type { WebhookEvent } from '@/types'

export function WebhookEvents() {
  const queryClient = useQueryClient()
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null)

  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['webhook-events'],
    queryFn: async () => {
      const response = await api.get('/webhook-entrada/events')
      return response.data
    },
    refetchInterval: 10000,
  })

  const { data: stats } = useQuery({
    queryKey: ['webhook-events-stats'],
    queryFn: async () => {
      const response = await api.get('/webhook-entrada/stats')
      return response.data
    },
  })

  const { data: webhookInfo } = useQuery({
    queryKey: ['webhook-info'],
    queryFn: async () => {
      const response = await api.get('/webhook-entrada/info')
      return response.data
    },
  })

  const { data: variablesData } = useQuery({
    queryKey: ['webhook-variables'],
    queryFn: async () => {
      const response = await api.get('/webhook-entrada/variables')
      return response.data
    },
  })

  const generateTokenMutation = useMutation({
    mutationFn: async () => {
      return api.post('/webhook-entrada/generate-token')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-info'] })
    },
  })

  const removeTokenMutation = useMutation({
    mutationFn: async () => {
      return api.delete('/webhook-entrada/remove-token')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-info'] })
    },
  })

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/webhook-entrada/events/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-events'] })
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const events = eventsData?.events || []
  const variables = variablesData?.variables || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Webhook de Entrada</h2>
          <p className="text-muted-foreground">
            Receba dados externos e extraia variaveis automaticamente
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  URL do Webhook
                </CardTitle>
                <CardDescription>
                  Envie qualquer JSON para esta URL
                </CardDescription>
              </div>
              <Badge variant={webhookInfo.tokenConfigured ? 'default' : 'secondary'}>
                {webhookInfo.tokenConfigured ? (
                  <><Shield className="h-3 w-3 mr-1" /> Protegido</>
                ) : (
                  <><ShieldOff className="h-3 w-3 mr-1" /> Publico</>
                )}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">URL Base</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                  {webhookInfo.webhookUrl}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(webhookInfo.webhookUrl)}
                  title="Copiar URL"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {webhookInfo.tokenConfigured && webhookInfo.webhookToken && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1">
                    <Key className="h-3 w-3" /> Token
                  </Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-green-500/10 border border-green-500/20 rounded text-sm break-all font-mono">
                      {webhookInfo.webhookToken}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(webhookInfo.webhookToken)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">URL com Token</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                      {webhookInfo.webhookUrlWithToken}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(webhookInfo.webhookUrlWithToken)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              Metodo: POST | Content-Type: application/json
            </p>

            <div className="flex gap-2 pt-2 border-t">
              {webhookInfo.tokenConfigured ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateTokenMutation.mutate()}
                    disabled={generateTokenMutation.isPending}
                  >
                    {generateTokenMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-1" />
                    )}
                    Regenerar Token
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeTokenMutation.mutate()}
                    disabled={removeTokenMutation.isPending}
                    className="text-red-500"
                  >
                    <ShieldOff className="h-4 w-4 mr-1" />
                    Remover Protecao
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => generateTokenMutation.mutate()}
                  disabled={generateTokenMutation.isPending}
                >
                  <Shield className="h-4 w-4 mr-1" />
                  Gerar Token
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Variables */}
      {variables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Variaveis Disponiveis</CardTitle>
            <CardDescription>
              Variaveis extraidas dos webhooks recebidos (use em Automacoes)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {variables.map((v: any) => (
                <Badge
                  key={v.key}
                  variant="outline"
                  className="font-mono text-xs cursor-pointer hover:bg-muted"
                  onClick={() => copyToClipboard(v.placeholder)}
                >
                  {v.placeholder}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total de Eventos</p>
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

      {/* Events List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Eventos Recebidos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {events.map((event: WebhookEvent) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
                      <Webhook className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {event.variables?.length || 0} variaveis extraidas
                      </p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('Excluir este evento?')) {
                          deleteEventMutation.mutate(event.id)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}

              {events.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium text-lg mb-2">Nenhum evento</h3>
                  <p className="text-muted-foreground text-center">
                    Envie dados para a URL do webhook
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Event Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
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
                  <Label>Recebido em</Label>
                  <p className="font-medium">
                    {new Date(selectedEvent.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <Label>IP</Label>
                  <p className="font-medium">{selectedEvent.ipAddress}</p>
                </div>
              </div>

              {selectedEvent.variables && selectedEvent.variables.length > 0 && (
                <div>
                  <Label>Variaveis Extraidas</Label>
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
                <Label>Payload</Label>
                <pre className="mt-2 p-4 bg-muted rounded text-sm overflow-auto max-h-60">
                  {JSON.stringify(selectedEvent.rawPayload, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedEvent(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
