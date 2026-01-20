import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Send,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  Loader2,
  MessageSquare,
  X,
  Image,
  Video,
  Music,
  File,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import api from '@/services/api'
import type { Instance, Message } from '@/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function Messages() {
  const [selectedInstance, setSelectedInstance] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [page, setPage] = useState(1)

  const { data: instances } = useQuery<Instance[]>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['messages', selectedInstance, page],
    queryFn: async () => {
      const response = await api.get(`/messages/${selectedInstance}?page=${page}&limit=50`)
      return response.data
    },
    enabled: !!selectedInstance,
  })

  const messages = messagesData?.messages || []
  const pagination = messagesData?.pagination

  const filteredMessages = messages.filter((msg: Message) =>
    msg.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    msg.remoteJid.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-4 w-4 text-muted-foreground" />
      case 'SENT':
        return <Check className="h-4 w-4 text-muted-foreground" />
      case 'DELIVERED':
        return <CheckCheck className="h-4 w-4 text-muted-foreground" />
      case 'READ':
        return <CheckCheck className="h-4 w-4 text-blue-500" />
      case 'FAILED':
        return <AlertCircle className="h-4 w-4 text-destructive" />
      default:
        return null
    }
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      PENDING: 'Pendente',
      SENT: 'Enviado',
      DELIVERED: 'Entregue',
      READ: 'Lido',
      FAILED: 'Falhou',
    }
    return labels[status] || status
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <Image className="h-4 w-4" />
      case 'video':
        return <Video className="h-4 w-4" />
      case 'audio':
        return <Music className="h-4 w-4" />
      case 'document':
        return <File className="h-4 w-4" />
      default:
        return <MessageSquare className="h-4 w-4" />
    }
  }

  const formatPhoneNumber = (jid: string) => {
    return jid.replace('@s.whatsapp.net', '').replace('@g.us', ' (Grupo)')
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Mensagens</h2>
        <p className="text-muted-foreground">
          Historico de mensagens enviadas e recebidas
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Select value={selectedInstance} onValueChange={(v) => { setSelectedInstance(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[250px]">
            <SelectValue placeholder="Selecione uma instancia" />
          </SelectTrigger>
          <SelectContent>
            {Array.isArray(instances) && instances.map((instance) => (
              <SelectItem key={instance.id} value={instance.id}>
                {instance.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por numero ou conteudo..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Messages List */}
      {!selectedInstance ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">Selecione uma instancia</h3>
            <p className="text-muted-foreground text-center">
              Escolha uma instancia para visualizar o historico de mensagens
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {filteredMessages.map((message: Message) => (
                  <div
                    key={message.id}
                    className="flex items-start justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedMessage(message)}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          message.direction === 'OUTBOUND'
                            ? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
                            : 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                        }`}
                      >
                        {message.direction === 'OUTBOUND' ? (
                          <ArrowUpCircle className="h-5 w-5" />
                        ) : (
                          <ArrowDownCircle className="h-5 w-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">
                            {formatPhoneNumber(message.remoteJid)}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(message.createdAt), 'dd/MM/yyyy HH:mm', {
                              locale: ptBR,
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {message.content}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <div className="flex items-center gap-1">
                        {getTypeIcon(message.type)}
                      </div>
                      {getStatusIcon(message.status)}
                    </div>
                  </div>
                ))}

                {filteredMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-medium text-lg mb-2">Nenhuma mensagem</h3>
                    <p className="text-muted-foreground text-center">
                      {searchTerm ? 'Nenhuma mensagem encontrada para esta busca' : 'Ainda nao ha mensagens nesta instancia'}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Pagina {pagination.page} de {pagination.pages} ({pagination.total} mensagens)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === pagination.pages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Proximo
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Message Detail Modal */}
      <Dialog open={!!selectedMessage} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedMessage?.direction === 'OUTBOUND' ? (
                <ArrowUpCircle className="h-5 w-5 text-green-500" />
              ) : (
                <ArrowDownCircle className="h-5 w-5 text-blue-500" />
              )}
              {selectedMessage?.direction === 'OUTBOUND' ? 'Mensagem Enviada' : 'Mensagem Recebida'}
            </DialogTitle>
          </DialogHeader>

          {selectedMessage && (
            <div className="space-y-4">
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Numero</p>
                  <p className="font-mono">{formatPhoneNumber(selectedMessage.remoteJid)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Data/Hora</p>
                  <p>{format(new Date(selectedMessage.createdAt), "dd/MM/yyyy 'as' HH:mm:ss", { locale: ptBR })}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tipo</p>
                  <div className="flex items-center gap-2">
                    {getTypeIcon(selectedMessage.type)}
                    <span className="capitalize">{selectedMessage.type}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedMessage.status)}
                    <span>{getStatusLabel(selectedMessage.status)}</span>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Conteudo</p>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="whitespace-pre-wrap break-words">{selectedMessage.content}</p>
                </div>
              </div>

              {/* Media URL */}
              {selectedMessage.mediaUrl && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Midia</p>
                  {selectedMessage.type === 'image' ? (
                    <img
                      src={selectedMessage.mediaUrl}
                      alt="Media"
                      className="max-w-full max-h-64 rounded-lg"
                    />
                  ) : (
                    <a
                      href={selectedMessage.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {selectedMessage.mediaUrl}
                    </a>
                  )}
                </div>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                {selectedMessage.sentAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Enviado em</p>
                    <p className="text-sm">{format(new Date(selectedMessage.sentAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
                  </div>
                )}
                {selectedMessage.deliveredAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Entregue em</p>
                    <p className="text-sm">{format(new Date(selectedMessage.deliveredAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
                  </div>
                )}
                {selectedMessage.readAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Lido em</p>
                    <p className="text-sm">{format(new Date(selectedMessage.readAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
                  </div>
                )}
                {selectedMessage.failedAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Falhou em</p>
                    <p className="text-sm text-destructive">{format(new Date(selectedMessage.failedAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
                    {selectedMessage.failReason && (
                      <p className="text-sm text-destructive">{selectedMessage.failReason}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Message ID */}
              <div className="pt-4 border-t">
                <p className="text-sm font-medium text-muted-foreground">ID da Mensagem</p>
                <p className="font-mono text-xs break-all">{selectedMessage.messageId}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
