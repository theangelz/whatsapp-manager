import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Trash2,
  RotateCcw,
  Send,
  Phone,
  Play,
  Pause,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import api from '@/services/api'
import type { SendQueueItem, Instance } from '@/types'

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  WAITING: { label: 'Aguardando', color: 'bg-yellow-500', icon: Clock },
  SCHEDULED: { label: 'Agendado', color: 'bg-blue-500', icon: Clock },
  PROCESSING: { label: 'Processando', color: 'bg-purple-500', icon: Loader2 },
  COMPLETED: { label: 'Enviado', color: 'bg-green-500', icon: CheckCircle },
  FAILED: { label: 'Falhou', color: 'bg-red-500', icon: XCircle },
  CANCELLED: { label: 'Cancelado', color: 'bg-gray-500', icon: AlertCircle },
}

export function SendQueue() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [instanceFilter, setInstanceFilter] = useState<string>('all')
  const [showCancelAllDialog, setShowCancelAllDialog] = useState(false)
  const [showRetryAllDialog, setShowRetryAllDialog] = useState(false)

  const { data: queueData, isLoading } = useQuery({
    queryKey: ['send-queue', statusFilter, instanceFilter],
    queryFn: async () => {
      const params: any = { limit: 100 }
      if (statusFilter !== 'all') params.status = statusFilter
      if (instanceFilter !== 'all') params.instanceId = instanceFilter
      const response = await api.get('/send-queue', { params })
      return response.data
    },
    refetchInterval: 3000,
  })

  const { data: stats } = useQuery({
    queryKey: ['send-queue-stats', instanceFilter],
    queryFn: async () => {
      const params: any = {}
      if (instanceFilter !== 'all') params.instanceId = instanceFilter
      const response = await api.get('/send-queue/stats', { params })
      return response.data
    },
    refetchInterval: 5000,
  })

  const { data: instances } = useQuery({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/send-queue/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['send-queue'] })
    },
  })

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/send-queue/retry/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['send-queue'] })
    },
  })

  const cancelAllMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      return api.delete(`/send-queue/instance/${instanceId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['send-queue'] })
      setShowCancelAllDialog(false)
    },
  })

  const retryAllMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      return api.post(`/send-queue/retry-all/${instanceId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['send-queue'] })
      setShowRetryAllDialog(false)
    },
  })

  const items = queueData?.items || []
  const connectedInstances = (instances || []).filter((i: Instance) => i.status === 'CONNECTED')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Fila de Envio</h2>
          <p className="text-muted-foreground">
            Monitore e gerencie a fila de mensagens em tempo real
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['send-queue'] })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-500">{stats.waiting}</div>
              <p className="text-xs text-muted-foreground">Aguardando</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-500">{stats.scheduled}</div>
              <p className="text-xs text-muted-foreground">Agendados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-purple-500">{stats.processing}</div>
              <p className="text-xs text-muted-foreground">Processando</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">{stats.completed}</div>
              <p className="text-xs text-muted-foreground">Enviados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
              <p className="text-xs text-muted-foreground">Falhas</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="flex gap-4 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="WAITING">Aguardando</SelectItem>
            <SelectItem value="SCHEDULED">Agendados</SelectItem>
            <SelectItem value="PROCESSING">Processando</SelectItem>
            <SelectItem value="COMPLETED">Enviados</SelectItem>
            <SelectItem value="FAILED">Falhas</SelectItem>
            <SelectItem value="CANCELLED">Cancelados</SelectItem>
          </SelectContent>
        </Select>

        <Select value={instanceFilter} onValueChange={setInstanceFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Instância" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as instâncias</SelectItem>
            {connectedInstances.map((instance: Instance) => (
              <SelectItem key={instance.id} value={instance.id}>
                {instance.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {instanceFilter !== 'all' && (
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRetryAllDialog(true)}
              disabled={!stats?.failed}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Retentar Falhas ({stats?.failed || 0})
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowCancelAllDialog(true)}
              disabled={!stats?.pending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Cancelar Pendentes ({stats?.pending || 0})
            </Button>
          </div>
        )}
      </div>

      {/* Queue List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {items.map((item: SendQueueItem) => {
                const config = statusConfig[item.status] || statusConfig.WAITING
                const StatusIcon = config.icon
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full ${config.color} flex items-center justify-center`}>
                        <StatusIcon className={`h-5 w-5 text-white ${item.status === 'PROCESSING' ? 'animate-spin' : ''}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 font-medium">
                            <Phone className="h-4 w-4" />
                            {item.phoneNumber}
                          </span>
                          <Badge variant="secondary">{config.label}</Badge>
                          <Badge variant="outline">P{item.priority}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1 max-w-md">
                          {item.messageContent}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span>{item.instance?.name}</span>
                          <span>Tentativas: {item.attempts}/{item.maxAttempts}</span>
                          {item.scheduledFor && (
                            <span>Agendado: {new Date(item.scheduledFor).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.error && (
                        <span className="text-xs text-red-500 max-w-[200px] truncate">
                          {item.error}
                        </span>
                      )}
                      {item.status === 'FAILED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryMutation.mutate(item.id)}
                          disabled={retryMutation.isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {['WAITING', 'SCHEDULED'].includes(item.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelMutation.mutate(item.id)}
                          disabled={cancelMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}

              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Send className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium text-lg mb-2">Fila vazia</h3>
                  <p className="text-muted-foreground text-center">
                    Não há mensagens na fila no momento
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instance Breakdown */}
      {stats?.byInstance && Object.keys(stats.byInstance).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Por Instância</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats.byInstance).map(([instanceName, data]: [string, any]) => (
                <div key={instanceName} className="flex items-center justify-between">
                  <span className="font-medium">{instanceName}</span>
                  <div className="flex gap-2">
                    {data.WAITING && (
                      <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-500">
                        {data.WAITING} aguardando
                      </Badge>
                    )}
                    {data.PROCESSING && (
                      <Badge variant="secondary" className="bg-purple-500/10 text-purple-500">
                        {data.PROCESSING} processando
                      </Badge>
                    )}
                    {data.COMPLETED && (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-500">
                        {data.COMPLETED} enviados
                      </Badge>
                    )}
                    {data.FAILED && (
                      <Badge variant="secondary" className="bg-red-500/10 text-red-500">
                        {data.FAILED} falhas
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel All Dialog */}
      <AlertDialog open={showCancelAllDialog} onOpenChange={setShowCancelAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar todas as mensagens pendentes?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá cancelar todas as mensagens aguardando e agendadas para a instância selecionada.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não, manter</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelAllMutation.mutate(instanceFilter)}
            >
              {cancelAllMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sim, cancelar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Retry All Dialog */}
      <AlertDialog open={showRetryAllDialog} onOpenChange={setShowRetryAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retentar todas as mensagens com falha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá recolocar na fila todas as mensagens que falharam para a instância selecionada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => retryAllMutation.mutate(instanceFilter)}>
              {retryAllMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retentar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
