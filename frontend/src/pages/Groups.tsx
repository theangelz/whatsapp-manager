import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Loader2,
  Search,
  RefreshCw,
  MessageSquare,
  User,
  Copy,
  Check,
  Smartphone,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import api from '@/services/api'
import type { Instance } from '@/types'

interface Group {
  id: string
  name: string
  participants?: number
  owner?: string
  creation?: number
  description?: string
}

export function Groups() {
  const [selectedInstance, setSelectedInstance] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)

  const { data: instances, isLoading: loadingInstances } = useQuery<Instance[]>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  const { data: groups, isLoading: loadingGroups, refetch, isFetching } = useQuery<Group[]>({
    queryKey: ['groups', selectedInstance],
    queryFn: async () => {
      if (!selectedInstance) return []
      const response = await api.get(`/instances/${selectedInstance}/groups`)
      return response.data
    },
    enabled: !!selectedInstance,
  })

  const connectedInstances = instances?.filter(
    (i) => i.status === 'CONNECTED' && i.channel === 'BAILEYS'
  ) || []

  const filteredGroups = groups?.filter((group) =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.id.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(text)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '-'
    return new Date(timestamp * 1000).toLocaleDateString('pt-BR')
  }

  const openGroupDetails = async (group: Group) => {
    setSelectedGroup(group)
    setShowDetailsModal(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Grupos</h2>
        <p className="text-muted-foreground">
          Visualize e gerencie os grupos de WhatsApp das suas instancias
        </p>
      </div>

      {/* Instance Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Selecionar Instancia
          </CardTitle>
          <CardDescription>
            Escolha uma instancia conectada para ver seus grupos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingInstances ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Carregando instancias...</span>
            </div>
          ) : connectedInstances.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma instancia Baileys conectada</p>
              <p className="text-sm">Conecte uma instancia para ver os grupos</p>
            </div>
          ) : (
            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger className="w-full md:w-[400px]">
                <SelectValue placeholder="Selecione uma instancia" />
              </SelectTrigger>
              <SelectContent>
                {connectedInstances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    <div className="flex items-center gap-2">
                      <span>{instance.name}</span>
                      {instance.phoneNumber && (
                        <span className="text-muted-foreground">
                          ({instance.phoneNumber})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Groups List */}
      {selectedInstance && (
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Grupos ({filteredGroups.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar grupo..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingGroups || isFetching ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mb-4 opacity-50" />
                <p className="font-medium">
                  {searchTerm ? 'Nenhum grupo encontrado' : 'Nenhum grupo nesta instancia'}
                </p>
                <p className="text-sm">
                  {searchTerm
                    ? 'Tente outro termo de busca'
                    : 'Os grupos que voce participa aparecerao aqui'}
                </p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Nome</TableHead>
                      <TableHead className="min-w-[250px]">ID do Grupo</TableHead>
                      <TableHead className="text-center">Participantes</TableHead>
                      <TableHead className="text-center">Criado em</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <Users className="h-4 w-4 text-primary" />
                            </div>
                            <span className="truncate max-w-[150px]" title={group.name}>
                              {group.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[180px]" title={group.id}>
                              {group.id}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(group.id)}
                            >
                              {copiedId === group.id ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">
                            <User className="h-3 w-3 mr-1" />
                            {group.participants || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {formatDate(group.creation)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openGroupDetails(group)}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" />
                            Detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No instance selected */}
      {!selectedInstance && !loadingInstances && connectedInstances.length > 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">Selecione uma instancia</h3>
            <p className="text-muted-foreground text-center">
              Escolha uma instancia conectada acima para visualizar seus grupos
            </p>
          </CardContent>
        </Card>
      )}

      {/* Group Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Detalhes do Grupo
            </DialogTitle>
            <DialogDescription>
              Informacoes sobre o grupo selecionado
            </DialogDescription>
          </DialogHeader>
          {selectedGroup && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Nome</label>
                <p className="font-medium">{selectedGroup.name}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">ID do Grupo</label>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-muted px-2 py-1 rounded flex-1 break-all">
                    {selectedGroup.id}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(selectedGroup.id)}
                  >
                    {copiedId === selectedGroup.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Participantes</label>
                  <p className="font-medium">{selectedGroup.participants || '-'}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Criado em</label>
                  <p className="font-medium">{formatDate(selectedGroup.creation)}</p>
                </div>
              </div>

              {selectedGroup.description && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Descricao</label>
                  <p className="text-sm bg-muted p-2 rounded">{selectedGroup.description}</p>
                </div>
              )}

              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  Use o ID do grupo para enviar mensagens via API.
                  <br />
                  Exemplo: <code className="bg-muted px-1 rounded">to: "{selectedGroup.id}"</code>
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
