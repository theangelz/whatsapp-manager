import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Webhook,
  Plus,
  Settings,
  TestTube,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
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
import type { Instance } from '@/types'

const availableEvents = [
  { value: 'message.received', label: 'Mensagem recebida' },
  { value: 'message.sent', label: 'Mensagem enviada' },
  { value: 'message.delivered', label: 'Mensagem entregue' },
  { value: 'message.read', label: 'Mensagem lida' },
  { value: 'message.failed', label: 'Falha no envio' },
  { value: 'connection.open', label: 'Conexão aberta' },
  { value: 'connection.close', label: 'Conexão fechada' },
]

export function Webhooks() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [formData, setFormData] = useState({
    instanceId: '',
    webhookUrl: '',
    events: ['message.received'] as string[],
  })

  const { data: instances } = useQuery<Instance[]>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return api.post('/n8n', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      setShowModal(false)
      setFormData({
        instanceId: '',
        webhookUrl: '',
        events: ['message.received'],
      })
    },
  })

  const testMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const response = await api.post(`/n8n/${instanceId}/test`)
      return response.data
    },
    onSuccess: (data) => {
      setTestResult({ success: true, message: 'Webhook enviado com sucesso!' })
    },
    onError: (error: any) => {
      setTestResult({
        success: false,
        message: error.response?.data?.error || 'Erro ao testar webhook',
      })
    },
  })

  const toggleEvent = (event: string) => {
    if (formData.events.includes(event)) {
      setFormData({
        ...formData,
        events: formData.events.filter((e) => e !== event),
      })
    } else {
      setFormData({
        ...formData,
        events: [...formData.events, event],
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Webhooks / n8n</h2>
          <p className="text-muted-foreground">
            Configure webhooks para integração com n8n e outros sistemas
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
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                    <Webhook className="h-5 w-5 text-orange-600 dark:text-orange-300" />
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
                    <Webhook className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Webhook</span>
                  </div>
                  {(instance as any).n8nIntegration ? (
                    <Badge variant={(instance as any).n8nIntegration.isActive ? 'success' : 'secondary'}>
                      {(instance as any).n8nIntegration.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Não configurado</Badge>
                  )}
                </div>

                {(instance as any).n8nIntegration && (
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    <p className="truncate">URL: {(instance as any).n8nIntegration.webhookUrl}</p>
                    <p>Eventos: {(instance as any).n8nIntegration.events?.length || 0}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => {
                      const integration = (instance as any).n8nIntegration
                      setFormData({
                        instanceId: instance.id,
                        webhookUrl: integration?.webhookUrl || '',
                        events: integration?.events || ['message.received'],
                      })
                      setShowModal(true)
                    }}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    {(instance as any).n8nIntegration ? 'Editar' : 'Configurar'}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => testMutation.mutate(instance.id)}
                    disabled={testMutation.isPending || !(instance as any).n8nIntegration}
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {instances?.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg mb-2">Nenhuma instância</h3>
              <p className="text-muted-foreground text-center">
                Crie uma instância primeiro para configurar webhooks
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Test Result Toast */}
      {testResult && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg flex items-center gap-2 ${
            testResult.success
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
          }`}
        >
          {testResult.success ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          {testResult.message}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTestResult(null)}
          >
            Fechar
          </Button>
        </div>
      )}

      {/* Configure Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Webhook</DialogTitle>
            <DialogDescription>
              Configure a URL e eventos do webhook
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
              <Label>URL do Webhook</Label>
              <Input
                placeholder="https://n8n.example.com/webhook/..."
                value={formData.webhookUrl}
                onChange={(e) =>
                  setFormData({ ...formData, webhookUrl: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Eventos</Label>
              <div className="grid grid-cols-2 gap-2">
                {availableEvents.map((event) => (
                  <div
                    key={event.value}
                    className="flex items-center space-x-2"
                  >
                    <Switch
                      checked={formData.events.includes(event.value)}
                      onCheckedChange={() => toggleEvent(event.value)}
                    />
                    <Label className="text-sm font-normal">{event.label}</Label>
                  </div>
                ))}
              </div>
            </div>
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
                !formData.webhookUrl ||
                formData.events.length === 0 ||
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
    </div>
  )
}
