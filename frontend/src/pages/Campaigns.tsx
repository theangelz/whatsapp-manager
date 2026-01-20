import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Play,
  Pause,
  BarChart3,
  MoreVertical,
  Trash2,
  Send,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/services/api'
import type { Campaign, Instance } from '@/types'

export function Campaigns() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    messageType: 'text',
    messageContent: '',
    delay: 3000,
    instanceIds: [] as string[],
  })

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await api.get('/campaigns')
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

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return api.post('/campaigns', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setShowModal(false)
      setFormData({
        name: '',
        description: '',
        messageType: 'text',
        messageContent: '',
        delay: 3000,
        instanceIds: [],
      })
    },
  })

  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/campaigns/${id}/start`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/campaigns/${id}/pause`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/campaigns/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: string; icon: any }> = {
      DRAFT: { label: 'Rascunho', variant: 'secondary', icon: Clock },
      SCHEDULED: { label: 'Agendada', variant: 'outline', icon: Clock },
      RUNNING: { label: 'Em execução', variant: 'default', icon: Play },
      PAUSED: { label: 'Pausada', variant: 'warning', icon: Pause },
      COMPLETED: { label: 'Concluída', variant: 'success', icon: CheckCircle },
      CANCELLED: { label: 'Cancelada', variant: 'destructive', icon: XCircle },
    }
    const { label, variant, icon: Icon } = config[status] || config.DRAFT
    return (
      <Badge variant={variant as any} className="gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Campanhas</h2>
          <p className="text-muted-foreground">
            Gerencie disparos em massa
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} variant="whatsapp">
          <Plus className="mr-2 h-4 w-4" />
          Nova Campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.isArray(campaigns) && campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{campaign.name}</CardTitle>
                    {campaign.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {campaign.description}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {campaign.status === 'DRAFT' || campaign.status === 'PAUSED' ? (
                        <DropdownMenuItem onClick={() => startMutation.mutate(campaign.id)}>
                          <Play className="mr-2 h-4 w-4" />
                          Iniciar
                        </DropdownMenuItem>
                      ) : null}
                      {campaign.status === 'RUNNING' && (
                        <DropdownMenuItem onClick={() => pauseMutation.mutate(campaign.id)}>
                          <Pause className="mr-2 h-4 w-4" />
                          Pausar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Relatório
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(campaign.id)}
                        disabled={campaign.status === 'RUNNING'}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {getStatusBadge(campaign.status)}

                <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{campaign.totalContacts}</p>
                      <p className="text-xs text-muted-foreground">Contatos</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">{campaign.sentCount}</p>
                      <p className="text-xs text-muted-foreground">Enviados</p>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {campaign.totalContacts > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progresso</span>
                      <span>
                        {Math.round((campaign.sentCount / campaign.totalContacts) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${(campaign.sentCount / campaign.totalContacts) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {campaigns?.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Send className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg mb-2">Nenhuma campanha</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Crie sua primeira campanha para disparar mensagens em massa
                </p>
                <Button onClick={() => setShowModal(true)} variant="whatsapp">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Campanha
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
            <DialogDescription>
              Configure uma nova campanha de disparo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Campanha</Label>
              <Input
                id="name"
                placeholder="Black Friday 2024"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Input
                id="description"
                placeholder="Campanha promocional"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance">Instância</Label>
              <Select
                value={formData.instanceIds[0] || ''}
                onValueChange={(value) =>
                  setFormData({ ...formData, instanceIds: [value] })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma instância" />
                </SelectTrigger>
                <SelectContent>
                  {instances
                    ?.filter((i) => i.status === 'CONNECTED')
                    .map((instance) => (
                      <SelectItem key={instance.id} value={instance.id}>
                        {instance.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Mensagem</Label>
              <textarea
                id="message"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Digite a mensagem..."
                value={formData.messageContent}
                onChange={(e) =>
                  setFormData({ ...formData, messageContent: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="delay">Delay entre mensagens (ms)</Label>
              <Input
                id="delay"
                type="number"
                min={1000}
                max={60000}
                value={formData.delay}
                onChange={(e) =>
                  setFormData({ ...formData, delay: parseInt(e.target.value) || 3000 })
                }
              />
              <p className="text-xs text-muted-foreground">
                Recomendado: 3000ms para evitar bloqueios
              </p>
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
                !formData.name ||
                !formData.messageContent ||
                formData.instanceIds.length === 0 ||
                createMutation.isPending
              }
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Criar Campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
