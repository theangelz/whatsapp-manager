import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Eye,
  FileText,
  Loader2,
  CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import type { MessageTemplate } from '@/types'

const templateTypes = [
  { value: 'COBRANCA', label: 'Cobranca' },
  { value: 'LEMBRETE', label: 'Lembrete' },
  { value: 'AVISO', label: 'Aviso' },
  { value: 'PROMOCAO', label: 'Promocao' },
  { value: 'CONFIRMACAO', label: 'Confirmacao' },
  { value: 'CUSTOM', label: 'Personalizado' },
]

const channelTypes = [
  { value: 'BAILEYS', label: 'Baileys (Não Oficial)' },
  { value: 'CLOUD_API', label: 'Cloud API (Oficial Meta)' },
]

export function MessageTemplates() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null)
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({})
  const [previewResult, setPreviewResult] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'CUSTOM',
    channelType: 'BAILEYS',
    isHomologated: false,
    metaTemplateName: '',
    bodyText: '',
    headerText: '',
    footerText: '',
  })

  const { data: templates, isLoading } = useQuery({
    queryKey: ['message-templates', searchTerm, typeFilter],
    queryFn: async () => {
      const params: any = {}
      if (searchTerm) params.search = searchTerm
      if (typeFilter !== 'all') params.type = typeFilter
      const response = await api.get('/message-templates', { params })
      return response.data
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['message-templates-stats'],
    queryFn: async () => {
      const response = await api.get('/message-templates/stats/overview')
      return response.data
    },
  })

  // Templates Meta aprovados (para Cloud API)
  const { data: metaTemplates } = useQuery({
    queryKey: ['meta-templates'],
    queryFn: async () => {
      const response = await api.get('/templates')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingTemplate) {
        return api.put(`/message-templates/${editingTemplate.id}`, data)
      }
      return api.post('/message-templates', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      closeModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/message-templates/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/message-templates/${id}/duplicate`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] })
    },
  })

  const previewMutation = useMutation({
    mutationFn: async (data: { id: string; variables: Record<string, string> }) => {
      const response = await api.post(`/message-templates/${data.id}/preview`, {
        variables: data.variables,
      })
      return response.data
    },
    onSuccess: (data) => {
      setPreviewResult(data)
    },
  })

  const openModal = (template?: MessageTemplate) => {
    if (template) {
      setEditingTemplate(template)
      setFormData({
        name: template.name,
        description: template.description || '',
        type: template.type,
        channelType: template.channelType,
        isHomologated: template.isHomologated,
        metaTemplateName: template.metaTemplateName || '',
        bodyText: template.bodyText,
        headerText: template.headerText || '',
        footerText: template.footerText || '',
      })
    } else {
      setEditingTemplate(null)
      setFormData({
        name: '',
        description: '',
        type: 'CUSTOM',
        channelType: 'BAILEYS',
        isHomologated: false,
        metaTemplateName: '',
        bodyText: '',
        headerText: '',
        footerText: '',
      })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingTemplate(null)
    setFormData({
      name: '',
      description: '',
      type: 'CUSTOM',
      channelType: 'BAILEYS',
      isHomologated: false,
      metaTemplateName: '',
      bodyText: '',
      headerText: '',
      footerText: '',
    })
  }

  const openPreview = (template: MessageTemplate) => {
    setPreviewTemplate(template)
    setPreviewVariables({})
    setPreviewResult(null)
    if (template.extractedVariables) {
      const vars: Record<string, string> = {}
      template.extractedVariables.forEach((v) => {
        vars[v] = ''
      })
      setPreviewVariables(vars)
    }
    setShowPreviewModal(true)
  }

  const handleSubmit = () => {
    createMutation.mutate({
      name: formData.name,
      description: formData.description || undefined,
      type: formData.type,
      channelType: formData.channelType,
      isHomologated: formData.isHomologated,
      metaTemplateName: formData.metaTemplateName || undefined,
      bodyText: formData.bodyText,
      headerText: formData.headerText || undefined,
      footerText: formData.footerText || undefined,
    })
  }

  const extractVariables = (text: string): string[] => {
    const regex = /{{(\w+)}}/g
    const matches: string[] = []
    let match
    while ((match = regex.exec(text)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1])
      }
    }
    return matches
  }

  const bodyVariables = extractVariables(formData.bodyText)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Templates de Mensagem</h2>
          <p className="text-muted-foreground">
            Gerencie templates com variaveis dinamicas
          </p>
        </div>
        <Button onClick={() => openModal()} variant="whatsapp">
          <Plus className="mr-2 h-4 w-4" />
          Novo Template
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total de Templates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">{stats.homologated}</div>
              <p className="text-xs text-muted-foreground">Homologados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {stats.mostUsed?.[0]?.usageCount || 0}
              </div>
              <p className="text-xs text-muted-foreground">Mais usado</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {stats.byChannel?.BAILEYS || 0}
              </div>
              <p className="text-xs text-muted-foreground">Templates Baileys</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar templates..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {templateTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Templates List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(templates || []).map((template: MessageTemplate) => (
            <Card key={template.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    {template.description && (
                      <p className="text-sm text-muted-foreground">
                        {template.description}
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
                      <DropdownMenuItem onClick={() => openPreview(template)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openModal(template)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicateMutation.mutate(template.id)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(template.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary">{template.type}</Badge>
                  <Badge variant="outline">{template.channelType}</Badge>
                  {template.isHomologated && (
                    <Badge className="bg-green-500">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Homologado
                    </Badge>
                  )}
                </div>

                <div className="p-2 bg-muted rounded text-sm">
                  <p className="line-clamp-3">{template.bodyText}</p>
                </div>

                {template.extractedVariables && template.extractedVariables.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {template.extractedVariables.map((v) => (
                      <Badge key={v} variant="outline" className="font-mono text-xs">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Usos: {template.usageCount}</span>
                  {template.lastUsedAt && (
                    <span>Último: {new Date(template.lastUsedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {(templates || []).length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg mb-2">Nenhum template</h3>
              <p className="text-muted-foreground text-center">
                Crie seu primeiro template para começar
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Template' : 'Novo Template'}
            </DialogTitle>
            <DialogDescription>
              Use {`{{variavel}}`} para criar campos dinâmicos
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  placeholder="Nome do template"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Descrição opcional"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Canal</Label>
              <Select
                value={formData.channelType}
                onValueChange={(v) => setFormData({ ...formData, channelType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {channelTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cloud API - Selecionar template Meta existente */}
            {formData.channelType === 'CLOUD_API' && (
              <div className="space-y-4 p-4 border rounded-lg bg-blue-500/5">
                <div className="flex items-center gap-2 text-blue-500">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Cloud API - Selecione um Template Homologado</span>
                </div>

                <div className="space-y-2">
                  <Label>Template Meta Aprovado</Label>
                  <Select
                    value={formData.metaTemplateName}
                    onValueChange={(v) => {
                      const selected = (metaTemplates || []).find((t: any) => t.name === v)
                      if (selected) {
                        setFormData({
                          ...formData,
                          metaTemplateName: selected.name,
                          isHomologated: true,
                          bodyText: selected.bodyText || '',
                          headerText: selected.headerContent || '',
                          footerText: selected.footerText || '',
                        })
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um template aprovado" />
                    </SelectTrigger>
                    <SelectContent>
                      {(metaTemplates || [])
                        .filter((t: any) => t.status === 'APPROVED')
                        .map((t: any) => (
                          <SelectItem key={t.id} value={t.name}>
                            {t.name} ({t.category})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Apenas templates aprovados pela Meta podem ser usados
                  </p>
                </div>

                {formData.metaTemplateName && (
                  <div className="space-y-2">
                    <Label>Corpo do Template (somente leitura)</Label>
                    <div className="p-3 bg-muted rounded text-sm whitespace-pre-wrap">
                      {formData.bodyText || 'Nenhum conteúdo'}
                    </div>
                    {bodyVariables.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">Variáveis para preencher:</span>
                        {bodyVariables.map((v) => (
                          <Badge key={v} variant="outline" className="font-mono text-xs">
                            {`{{${v}}}`}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Baileys - Texto livre */}
            {formData.channelType === 'BAILEYS' && (
              <div className="space-y-2">
                <Label htmlFor="bodyText">Corpo da Mensagem</Label>
                <Textarea
                  id="bodyText"
                  placeholder="Olá {{nome}}, sua fatura de {{valor}} vence em {{data}}."
                  value={formData.bodyText}
                  onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
                  rows={5}
                />
                {bodyVariables.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">Variáveis:</span>
                    {bodyVariables.map((v) => (
                      <Badge key={v} variant="outline" className="font-mono text-xs">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Use {`{{variavel}}`} para criar campos dinâmicos
                </p>
              </div>
            )}

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <Button
              variant="whatsapp"
              onClick={handleSubmit}
              disabled={!formData.name || !formData.bodyText || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingTemplate ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Preview: {previewTemplate?.name}</DialogTitle>
            <DialogDescription>
              Preencha as variáveis para visualizar o resultado
            </DialogDescription>
          </DialogHeader>

          {previewTemplate && (
            <div className="space-y-4 py-4">
              {previewTemplate.extractedVariables && previewTemplate.extractedVariables.length > 0 && (
                <div className="space-y-3">
                  <Label>Variáveis</Label>
                  {previewTemplate.extractedVariables.map((v) => (
                    <div key={v} className="space-y-1">
                      <Label className="text-xs font-mono">{`{{${v}}}`}</Label>
                      <Input
                        placeholder={`Valor para ${v}`}
                        value={previewVariables[v] || ''}
                        onChange={(e) =>
                          setPreviewVariables({ ...previewVariables, [v]: e.target.value })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={() =>
                  previewMutation.mutate({
                    id: previewTemplate.id,
                    variables: previewVariables,
                  })
                }
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar Preview
              </Button>

              {previewResult && (
                <div className="space-y-2">
                  <Label>Resultado</Label>
                  {previewResult.header && (
                    <p className="text-sm font-medium">{previewResult.header}</p>
                  )}
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="whitespace-pre-wrap">{previewResult.body}</p>
                  </div>
                  {previewResult.footer && (
                    <p className="text-xs text-muted-foreground">{previewResult.footer}</p>
                  )}
                  {previewResult.missingVariables?.length > 0 && (
                    <p className="text-xs text-yellow-500">
                      Variáveis faltando: {previewResult.missingVariables.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewModal(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
