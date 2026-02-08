import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  Bell,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Phone,
  Timer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
// Toast helper using alert
const toast = {
  success: (msg: string) => alert(msg),
  error: (msg: string) => alert(msg),
}
import api from '@/services/api'

interface Instance {
  id: string
  name: string
  phoneNumber: string | null
}

interface WindowSubscriber {
  id: string
  companyId: string
  instanceId: string
  phoneNumber: string
  name: string | null
  isActive: boolean
  lastNotified: string | null
  createdAt: string
  windowOpen?: boolean
  windowExpiresAt?: string
  instance: {
    id: string
    name: string
    phoneNumber: string | null
  }
}

export function WindowSubscribers() {
  const queryClient = useQueryClient()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [newSubscriber, setNewSubscriber] = useState({
    instanceId: '',
    phoneNumber: '',
    name: '',
  })

  // Fetch subscribers
  const { data: subscribers = [], isLoading } = useQuery<WindowSubscriber[]>({
    queryKey: ['window-subscribers'],
    queryFn: async () => {
      const response = await api.get('/window-subscribers')
      return response.data
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Fetch instances for select
  const { data: instances = [] } = useQuery<Instance[]>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  // Create subscriber mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newSubscriber) => {
      const response = await api.post('/window-subscribers', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['window-subscribers'] })
      setShowAddDialog(false)
      setNewSubscriber({ instanceId: '', phoneNumber: '', name: '' })
      toast.success('Assinante cadastrado com sucesso!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao cadastrar assinante')
    },
  })

  // Delete subscriber mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/window-subscribers/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['window-subscribers'] })
      setDeleteId(null)
      toast.success('Assinante removido!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao remover assinante')
    },
  })

  // Send notification mutation
  const notifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/window-subscribers/${id}/notify`)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['window-subscribers'] })
      if (data.success) {
        toast.success('Notificação enviada!')
      } else {
        toast.error(data.error || 'Erro ao enviar notificação')
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao enviar notificação')
    },
  })

  // Format date to local time
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Calculate time remaining
  const getTimeRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return null
    const now = new Date()
    const expires = new Date(expiresAt)
    const diff = expires.getTime() - now.getTime()

    if (diff <= 0) return 'Expirada'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) {
      return `${hours}h ${minutes}min`
    }
    return `${minutes}min`
  }

  const handleCreate = () => {
    if (!newSubscriber.instanceId || !newSubscriber.phoneNumber) {
      toast.error('Preencha instância e telefone')
      return
    }
    createMutation.mutate(newSubscriber)
  }

  // Filter Cloud API instances only
  const cloudApiInstances = instances.filter(
    (i: any) => i.channel === 'CLOUD_API' || i.channel === 'COEXISTENCE'
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Janela 24h</h1>
          <p className="text-muted-foreground">
            Gerencie números que precisam manter a janela de 24h aberta
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Número
        </Button>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Como funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Quando o cliente envia mensagem, a janela de 24h abre</p>
          <p>• Com janela aberta, você pode enviar mensagens de texto (gratuito)</p>
          <p>• 5 minutos após a janela fechar, o sistema envia notificação pedindo para reabrir</p>
          <p>• Se o cliente responder, a janela reabre por mais 24h</p>
        </CardContent>
      </Card>

      {/* Subscribers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Números Monitorados</CardTitle>
          <CardDescription>
            {subscribers.length} número(s) cadastrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : subscribers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Nenhum número cadastrado</p>
              <p className="text-sm">Clique em "Adicionar Número" para começar</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Instância</TableHead>
                  <TableHead>Status Janela</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Última Notificação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((subscriber) => (
                  <TableRow key={subscriber.id}>
                    <TableCell className="font-mono">
                      {subscriber.phoneNumber}
                    </TableCell>
                    <TableCell>{subscriber.name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {subscriber.instance?.name || 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {subscriber.windowOpen ? (
                        <Badge className="bg-green-500">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Aberta
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" />
                          Fechada
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {subscriber.windowOpen && subscriber.windowExpiresAt ? (
                        <span className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3" />
                          {getTimeRemaining(subscriber.windowExpiresAt)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(subscriber.lastNotified)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => notifyMutation.mutate(subscriber.id)}
                          disabled={notifyMutation.isPending}
                        >
                          {notifyMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Bell className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteId(subscriber.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Número</DialogTitle>
            <DialogDescription>
              Cadastre um número para monitorar a janela de 24h
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Instância (Cloud API)</Label>
              <Select
                value={newSubscriber.instanceId}
                onValueChange={(value) =>
                  setNewSubscriber({ ...newSubscriber, instanceId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a instância" />
                </SelectTrigger>
                <SelectContent>
                  {cloudApiInstances.map((instance: any) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name} ({instance.phoneNumber || 'Sem número'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Número de Telefone</Label>
              <Input
                placeholder="5521999999999"
                value={newSubscriber.phoneNumber}
                onChange={(e) =>
                  setNewSubscriber({
                    ...newSubscriber,
                    phoneNumber: e.target.value.replace(/\D/g, ''),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Número que receberá as notificações de renovação
              </p>
            </div>

            <div className="space-y-2">
              <Label>Nome (opcional)</Label>
              <Input
                placeholder="Ex: Meu WhatsApp"
                value={newSubscriber.name}
                onChange={(e) =>
                  setNewSubscriber({ ...newSubscriber, name: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover número?</AlertDialogTitle>
            <AlertDialogDescription>
              O número não será mais monitorado e não receberá notificações de renovação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
