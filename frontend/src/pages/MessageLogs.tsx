import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Phone,
  Eye,
  Download,
  BarChart3,
  Activity,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/services/api'
import type { MessageLog, Instance } from '@/types'

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  QUEUED: { label: 'Na Fila', color: 'bg-gray-500', icon: Clock },
  PROCESSING: { label: 'Processando', color: 'bg-purple-500', icon: Loader2 },
  SENT: { label: 'Enviado', color: 'bg-blue-500', icon: CheckCircle },
  DELIVERED: { label: 'Entregue', color: 'bg-green-500', icon: CheckCircle },
  READ: { label: 'Lido', color: 'bg-green-600', icon: CheckCircle },
  FAILED: { label: 'Falhou', color: 'bg-red-500', icon: XCircle },
  CANCELLED: { label: 'Cancelado', color: 'bg-gray-500', icon: AlertCircle },
}

export function MessageLogs() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [instanceFilter, setInstanceFilter] = useState<string>('all')
  const [phoneFilter, setPhoneFilter] = useState('')
  const [selectedLog, setSelectedLog] = useState<MessageLog | null>(null)
  const [page, setPage] = useState(1)

  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['message-logs', statusFilter, instanceFilter, phoneFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: 50 }
      if (statusFilter !== 'all') params.status = statusFilter
      if (instanceFilter !== 'all') params.instanceId = instanceFilter
      if (phoneFilter) params.phoneNumber = phoneFilter
      const response = await api.get('/message-logs', { params })
      return response.data
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['message-logs-stats', instanceFilter],
    queryFn: async () => {
      const params: any = {}
      if (instanceFilter !== 'all') params.instanceId = instanceFilter
      const response = await api.get('/message-logs/stats', { params })
      return response.data
    },
  })

  const { data: hourlyStats } = useQuery({
    queryKey: ['message-logs-hourly', instanceFilter],
    queryFn: async () => {
      const params: any = {}
      if (instanceFilter !== 'all') params.instanceId = instanceFilter
      const response = await api.get('/message-logs/stats/hourly', { params })
      return response.data
    },
  })

  const { data: errors } = useQuery({
    queryKey: ['message-logs-errors', instanceFilter],
    queryFn: async () => {
      const params: any = { limit: 10 }
      if (instanceFilter !== 'all') params.instanceId = instanceFilter
      const response = await api.get('/message-logs/errors', { params })
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

  const handleExport = async () => {
    const params: any = { format: 'csv' }
    if (statusFilter !== 'all') params.status = statusFilter
    if (instanceFilter !== 'all') params.instanceId = instanceFilter

    const response = await api.get('/message-logs/export', {
      params,
      responseType: 'blob',
    })

    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'message-logs.csv')
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const logs = logsData?.logs || []
  const pagination = logsData?.pagination

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Logs de Envio</h2>
          <p className="text-muted-foreground">
            Historico completo de mensagens enviadas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total de Mensagens</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">
                {stats.byStatus.sent + stats.byStatus.delivered + stats.byStatus.read}
              </div>
              <p className="text-xs text-muted-foreground">Enviadas com Sucesso</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-500">{stats.byStatus.failed}</div>
              <p className="text-xs text-muted-foreground">Falhas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-500">{stats.successRate}%</div>
              <p className="text-xs text-muted-foreground">Taxa de Sucesso</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.avgProcessingTimeMs}ms</div>
              <p className="text-xs text-muted-foreground">Tempo Médio</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Today's Stats */}
      {stats?.today && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div>
                <span className="text-2xl font-bold">{stats.today.total}</span>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div>
                <span className="text-2xl font-bold text-green-500">{stats.today.sent}</span>
                <p className="text-xs text-muted-foreground">Enviadas</p>
              </div>
              <div>
                <span className="text-2xl font-bold text-red-500">{stats.today.failed}</span>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hourly Chart */}
      {hourlyStats?.hourly && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Envios por Hora ({hourlyStats.date})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {hourlyStats.hourly.map((h: any) => {
                const total = h.sent + h.failed
                const maxTotal = Math.max(...hourlyStats.hourly.map((x: any) => x.sent + x.failed), 1)
                const height = total > 0 ? (total / maxTotal) * 100 : 0
                return (
                  <div
                    key={h.hour}
                    className="flex-1 flex flex-col items-center"
                    title={`${h.hour}h: ${h.sent} enviados, ${h.failed} falhas`}
                  >
                    <div
                      className="w-full bg-green-500 rounded-t"
                      style={{ height: `${(h.sent / maxTotal) * 100}%` }}
                    />
                    {h.failed > 0 && (
                      <div
                        className="w-full bg-red-500"
                        style={{ height: `${(h.failed / maxTotal) * 100}%` }}
                      />
                    )}
                    <span className="text-[10px] text-muted-foreground mt-1">{h.hour}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Errors */}
      {errors?.errorTypes && errors.errorTypes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Erros Frequentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {errors.errorTypes.slice(0, 5).map((e: any, i: number) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground truncate max-w-[400px]">
                    {e.error}
                  </span>
                  <Badge variant="destructive">{e.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="QUEUED">Na Fila</SelectItem>
            <SelectItem value="PROCESSING">Processando</SelectItem>
            <SelectItem value="SENT">Enviado</SelectItem>
            <SelectItem value="DELIVERED">Entregue</SelectItem>
            <SelectItem value="READ">Lido</SelectItem>
            <SelectItem value="FAILED">Falhou</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={instanceFilter} onValueChange={(v) => { setInstanceFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Instância" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as instâncias</SelectItem>
            {(instances || []).map((instance: Instance) => (
              <SelectItem key={instance.id} value={instance.id}>
                {instance.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Filtrar por telefone..."
          className="w-[200px]"
          value={phoneFilter}
          onChange={(e) => { setPhoneFilter(e.target.value); setPage(1); }}
        />
      </div>

      {/* Logs List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {logs.map((log: MessageLog) => {
                const config = statusConfig[log.status] || statusConfig.QUEUED
                const StatusIcon = config.icon
                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedLog(log)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full ${config.color} flex items-center justify-center`}>
                        <StatusIcon className={`h-5 w-5 text-white ${log.status === 'PROCESSING' ? 'animate-spin' : ''}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 font-medium">
                            <Phone className="h-4 w-4" />
                            {log.phoneNumber}
                          </span>
                          <Badge variant="secondary">{config.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1 max-w-md">
                          {log.messageContent}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span>{log.instance?.name}</span>
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                          {log.processingTimeMs && <span>{log.processingTimeMs}ms</span>}
                        </div>
                      </div>
                    </div>

                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}

              {logs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium text-lg mb-2">Nenhum log encontrado</h3>
                  <p className="text-muted-foreground text-center">
                    Ajuste os filtros ou aguarde novos envios
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            Anterior
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Página {page} de {pagination.pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= pagination.pages}
          >
            Próxima
          </Button>
        </div>
      )}

      {/* Log Details Modal */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Log</DialogTitle>
            <DialogDescription>
              ID: {selectedLog?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={statusConfig[selectedLog.status]?.color}>
                      {statusConfig[selectedLog.status]?.label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label>Telefone</Label>
                  <p className="font-medium">{selectedLog.phoneNumber}</p>
                </div>
                <div>
                  <Label>Instância</Label>
                  <p className="font-medium">{selectedLog.instance?.name}</p>
                </div>
                <div>
                  <Label>Canal</Label>
                  <p className="font-medium">{selectedLog.instance?.channel}</p>
                </div>
                <div>
                  <Label>Tipo de Mensagem</Label>
                  <p className="font-medium">{selectedLog.messageType}</p>
                </div>
                <div>
                  <Label>Tempo de Processamento</Label>
                  <p className="font-medium">{selectedLog.processingTimeMs || 'N/A'}ms</p>
                </div>
              </div>

              <div>
                <Label>Conteúdo da Mensagem</Label>
                <div className="mt-2 p-3 bg-muted rounded whitespace-pre-wrap">
                  {selectedLog.messageContent}
                </div>
              </div>

              {selectedLog.appliedVariables && Object.keys(selectedLog.appliedVariables).length > 0 && (
                <div>
                  <Label>Variáveis Aplicadas</Label>
                  <div className="mt-2 space-y-1">
                    {Object.entries(selectedLog.appliedVariables).map(([key, value]) => (
                      <div key={key} className="flex justify-between p-2 bg-muted rounded text-sm">
                        <span className="font-mono">{`{{${key}}}`}</span>
                        <span className="text-muted-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Criado em</Label>
                  <p className="font-medium">
                    {new Date(selectedLog.createdAt).toLocaleString()}
                  </p>
                </div>
                {selectedLog.sentAt && (
                  <div>
                    <Label>Enviado em</Label>
                    <p className="font-medium">
                      {new Date(selectedLog.sentAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {selectedLog.failedAt && (
                  <div>
                    <Label>Falhou em</Label>
                    <p className="font-medium text-red-500">
                      {new Date(selectedLog.failedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {selectedLog.apiMessageId && (
                <div>
                  <Label>ID da Mensagem (API)</Label>
                  <p className="font-mono text-sm">{selectedLog.apiMessageId}</p>
                </div>
              )}

              {selectedLog.errorMessage && (
                <div>
                  <Label>Erro</Label>
                  <p className="text-red-500 p-2 bg-red-500/10 rounded">
                    {selectedLog.errorMessage}
                  </p>
                </div>
              )}

              {selectedLog.apiResponse && (
                <div>
                  <Label>Resposta da API</Label>
                  <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.apiResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLog(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
