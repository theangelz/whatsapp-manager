import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import api from '@/services/api'
import type { Template, Instance } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || window.location.origin

interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'ORDER_DETAILS'
  text: string
  url?: string
  phoneNumber?: string
  example?: string // Example code for COPY_CODE buttons (for Meta approval)
}

export function Templates() {
  const queryClient = useQueryClient()
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    language: 'pt_BR',
    category: 'UTILITY' as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
    headerType: 'none' as 'none' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT',
    headerContent: '',
    bodyText: '',
    footerText: '',
  })
  const [buttons, setButtons] = useState<TemplateButton[]>([])

  const { data: templates, isLoading, refetch } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await api.get('/templates')
      return response.data
    },
  })

  // Fetch instances for sync
  const { data: instances = [] } = useQuery<Instance[]>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  const cloudApiInstances = instances.filter(i => i.channel === 'CLOUD_API' && i.status === 'CONNECTED')

  // Sync templates mutation
  const syncMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      return api.post(`/instances/${instanceId}/sync-templates`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      setCreateError(null)
      setCreateSuccess(null)
      return api.post('/templates', data)
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setCreateSuccess(`Template "${response.data.name}" criado com sucesso! Aguardando aprovacao da Meta.`)
      setTimeout(() => {
        setShowCreateModal(false)
        resetForm()
        setCreateSuccess(null)
      }, 3000)
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || 'Erro desconhecido'
      const details = error.response?.data?.details ? JSON.stringify(error.response?.data?.details, null, 2) : ''
      setCreateError(`Erro da Meta: ${errorMsg}${details ? '\n\nDetalhes:\n' + details : ''}`)
    },
  })

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/templates/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  const resetForm = () => {
    setFormData({
      name: '',
      language: 'pt_BR',
      category: 'UTILITY',
      headerType: 'none',
      headerContent: '',
      bodyText: '',
      footerText: '',
    })
    setButtons([])
  }

  // Pre-fill with Disparo Livre template (no document)
  const loadDisparoLivreTemplate = () => {
    setFormData({
      name: 'disparo_livre',
      language: 'pt_BR',
      category: 'UTILITY',
      headerType: 'none',
      headerContent: '',
      bodyText: `Olá *{{1}}*! 👋

{{2}}`,
      footerText: '',
    })
    setButtons([])
  }

  // Pre-fill with Lembrete Vencimento template
  const loadLembreteTemplate = () => {
    setFormData({
      name: 'lembrete_vencimento',
      language: 'pt_BR',
      category: 'UTILITY',
      headerType: 'none',
      headerContent: '',
      bodyText: `Olá *{{1}}*! 👋

Lembrete: Sua fatura no valor de *R$ {{2}}* vence {{3}}.

Evite juros e multas, efetue o pagamento em dia!`,
      footerText: 'Mensagem automática',
    })
    setButtons([
      { type: 'COPY_CODE', text: 'Copiar código PIX', example: DEFAULT_CODE_EXAMPLE },
    ])
  }

  // Pre-fill with Fatura ORDER_DETAILS (igual SjnetworkAPI)
  // Exibe: Nome do item (Fatura #XXX - R$ YY), PIX, Boleto
  const loadOrderDetailsTemplate = () => {
    setFormData({
      name: 'fatura_no_dia',
      language: 'pt_BR',
      category: 'UTILITY',
      headerType: 'none',
      headerContent: '',
      bodyText: `Prezado(a) {{1}} , estamos passando para lembrar que sua fatura vence hoje. Caso o pagamento já tenha sido realizado, por favor desconsidere.

 💰 Valor: R$ {{2}}
 📅 Vencimento: {{3}}

 Em caso de dúvidas, entre em contato com nosso atendimento.`,
      footerText: 'SUA EMPRESA - Facilitando seu dia a dia',
    })
    // Botão ORDER_DETAILS - mostra detalhes do pedido com PIX e Boleto
    setButtons([
      { type: 'ORDER_DETAILS', text: 'Copy Pix code' },
    ])
  }

  // Example for COPY_CODE buttons (must be short - Meta rejects long codes)
  const DEFAULT_CODE_EXAMPLE = 'CODE12345'

  const addButton = () => {
    if (buttons.length >= 3) return
    // First button defaults to PIX example, second to Boleto
    // Using EXACT text from SjnetworkAPI (with accents)
    const defaultExample = buttons.length === 0 ? DEFAULT_CODE_EXAMPLE : DEFAULT_CODE_EXAMPLE
    const defaultText = buttons.length === 0 ? 'Copiar código PIX' : 'Copiar código de barras'
    setButtons([...buttons, { type: 'COPY_CODE', text: defaultText, example: defaultExample }])
  }

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index))
  }

  const updateButton = (index: number, field: keyof TemplateButton, value: string) => {
    const newButtons = [...buttons]
    newButtons[index] = { ...newButtons[index], [field]: value }
    setButtons(newButtons)
  }

  const handleCreateTemplate = () => {
    const data: any = {
      name: formData.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      language: formData.language,
      category: formData.category,
      bodyText: formData.bodyText,
    }

    if (formData.headerType !== 'none') {
      data.headerType = formData.headerType
      data.headerContent = formData.headerContent
    }

    if (formData.footerText) {
      data.footerText = formData.footerText
    }

    if (buttons.length > 0) {
      data.buttons = buttons.map(btn => ({
        type: btn.type,
        text: btn.text,
        url: btn.url,
        phoneNumber: btn.phoneNumber,
        example: btn.example,
      }))
    }

    createMutation.mutate(data)
  }

  const getStatusConfig = (status: string) => {
    const config: Record<string, { label: string; variant: string; icon: any; color: string }> = {
      PENDING: { label: 'Pendente', variant: 'outline', icon: Clock, color: 'text-yellow-600' },
      APPROVED: { label: 'Aprovado', variant: 'default', icon: CheckCircle, color: 'text-green-600' },
      REJECTED: { label: 'Rejeitado', variant: 'destructive', icon: XCircle, color: 'text-red-600' },
    }
    return config[status] || config.PENDING
  }

  const getCategoryLabel = (category: string) => {
    const categories: Record<string, string> = {
      MARKETING: 'Marketing',
      UTILITY: 'Utilidade',
      AUTHENTICATION: 'Autenticacao',
    }
    return categories[category] || category
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCode(id)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const generateCode = (template: Template, lang: 'curl' | 'javascript' | 'python' | 'php', token: string = 'SEU_TOKEN') => {
    // Build components array with proper structure
    const components: any[] = []

    // Extract variables from body text ({{1}}, {{2}}, etc.)
    const bodyVars = template.bodyText.match(/\{\{(\d+)\}\}/g) || []
    if (bodyVars.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyVars.map((v, idx) => ({
          type: 'text',
          text: `valor_variavel_${idx + 1}`
        }))
      })
    }

    // Add button examples if template has buttons (COPY_CODE type)
    if (template.buttons && template.buttons.length > 0) {
      template.buttons.forEach((btn, idx) => {
        // Check if it's a copy code button (commonly used for Pix/Boleto)
        if (btn.type === 'QUICK_REPLY' || btn.type === 'URL' || btn.type === 'PHONE_NUMBER') {
          // These buttons don't need parameters
        } else {
          // For copy_code buttons
          components.push({
            type: 'button',
            sub_type: 'copy_code',
            index: idx,
            parameters: [{
              type: 'coupon_code',
              coupon_code: idx === 0 ? 'CODIGO_PIX_AQUI' : 'CODIGO_BOLETO_AQUI'
            }]
          })
        }
      })
    }

    const payload = {
      to: '5511999999999',
      templateName: template.name,
      language: template.language,
      components: components,
    }

    switch (lang) {
      case 'curl':
        return `curl -X POST "${API_BASE_URL}/api/messages/api/send-template" \\
  -H "Content-Type: application/json" \\
  -H "x-api-token: ${token}" \\
  -d '${JSON.stringify(payload, null, 2)}'`

      case 'javascript':
        return `const response = await fetch("${API_BASE_URL}/api/messages/api/send-template", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-token": "${token}"
  },
  body: JSON.stringify(${JSON.stringify(payload, null, 4)})
});

const data = await response.json();
console.log(data);`

      case 'python':
        return `import requests

url = "${API_BASE_URL}/api/messages/api/send-template"
headers = {
    "Content-Type": "application/json",
    "x-api-token": "${token}"
}
payload = ${JSON.stringify(payload, null, 4)}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`

      case 'php':
        return `<?php
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => "${API_BASE_URL}/api/messages/api/send-template",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "x-api-token: ${token}"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "5511999999999",
        "templateName" => "${template.name}",
        "language" => "${template.language}",
        "components" => ${JSON.stringify(components, null, 8)}
    ])
]);
$response = curl_exec($curl);
curl_close($curl);
echo $response;
?>`
    }
  }

  const approvedCount = templates?.filter(t => t.status === 'APPROVED').length || 0
  const pendingCount = templates?.filter(t => t.status === 'PENDING').length || 0
  const rejectedCount = templates?.filter(t => t.status === 'REJECTED').length || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Templates</h2>
          <p className="text-muted-foreground">
            Templates do WhatsApp Cloud API para envio de mensagens
          </p>
        </div>
        <div className="flex gap-2">
          {cloudApiInstances.length > 0 && (
            <Select onValueChange={(id) => syncMutation.mutate(id)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sincronizar Templates" />
              </SelectTrigger>
              <SelectContent>
                {cloudApiInstances.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {syncMutation.isPending ? 'Sincronizando...' : inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Criar Template
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aprovados</p>
                <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejeitados</p>
                <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Templates Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Lista de Templates
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Clique em um template para ver o codigo de uso
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="space-y-2">
              {Array.isArray(templates) && templates.map((template) => {
                const statusConfig = getStatusConfig(template.status)
                const StatusIcon = statusConfig.icon
                const isExpanded = expandedTemplate === template.id

                return (
                  <Collapsible
                    key={template.id}
                    open={isExpanded}
                    onOpenChange={() => setExpandedTemplate(isExpanded ? null : template.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                        <div className="flex items-start gap-3">
                          <StatusIcon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${statusConfig.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium truncate">{template.name}</span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (confirm('Excluir este template?')) {
                                      deleteMutation.mutate(template.id)
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground truncate mt-1">
                              {template.bodyText}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {template.language}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {getCategoryLabel(template.category)}
                              </Badge>
                              <Badge variant={statusConfig.variant as any} className="text-xs">
                                {statusConfig.label}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 p-4 border rounded-lg space-y-4">
                        {/* Template Content */}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <h4 className="font-medium mb-2">Conteudo do Template</h4>
                            <div className="space-y-2 text-sm">
                              {template.headerContent && (
                                <div className="p-2 bg-muted rounded">
                                  <span className="text-xs text-muted-foreground">Header:</span>
                                  <p>{template.headerContent}</p>
                                </div>
                              )}
                              <div className="p-2 bg-muted rounded">
                                <span className="text-xs text-muted-foreground">Body:</span>
                                <p>{template.bodyText}</p>
                              </div>
                              {template.footerText && (
                                <div className="p-2 bg-muted rounded">
                                  <span className="text-xs text-muted-foreground">Footer:</span>
                                  <p>{template.footerText}</p>
                                </div>
                              )}
                              {template.buttons && template.buttons.length > 0 && (
                                <div className="p-2 bg-muted rounded">
                                  <span className="text-xs text-muted-foreground">Botoes ({template.buttons.length}):</span>
                                  <div className="mt-1 space-y-1">
                                    {template.buttons.map((btn, idx) => (
                                      <div key={idx} className="flex items-center gap-2 text-sm">
                                        <Badge variant="outline" className="text-xs">
                                          {btn.type === 'QUICK_REPLY' ? 'Resposta' :
                                           btn.type === 'URL' ? 'Link' :
                                           btn.type === 'PHONE_NUMBER' ? 'Telefone' : 'Copiar Codigo'}
                                        </Badge>
                                        <span>{btn.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Informacoes</h4>
                            <div className="space-y-1 text-sm">
                              <p><strong>Nome:</strong> {template.name}</p>
                              <p><strong>Idioma:</strong> {template.language}</p>
                              <p><strong>Categoria:</strong> {getCategoryLabel(template.category)}</p>
                              <p><strong>Status:</strong> {statusConfig.label}</p>
                            </div>
                          </div>
                        </div>

                        {/* Code Examples */}
                        {template.status === 'APPROVED' && (
                          <div>
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                              <Code className="h-4 w-4" />
                              Codigo para Envio
                            </h4>
                            <Tabs defaultValue="curl" className="w-full">
                              <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="curl">cURL</TabsTrigger>
                                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                                <TabsTrigger value="python">Python</TabsTrigger>
                                <TabsTrigger value="php">PHP</TabsTrigger>
                              </TabsList>
                              {(['curl', 'javascript', 'python', 'php'] as const).map((lang) => (
                                <TabsContent key={lang} value={lang}>
                                  <div className="relative">
                                    <pre className="p-4 bg-zinc-950 text-zinc-100 rounded-lg overflow-x-auto text-xs max-h-64">
                                      <code>{generateCode(template, lang)}</code>
                                    </pre>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-100"
                                      onClick={() => copyToClipboard(generateCode(template, lang), `${template.id}-${lang}`)}
                                    >
                                      {copiedCode === `${template.id}-${lang}` ? (
                                        <Check className="h-4 w-4" />
                                      ) : (
                                        <Copy className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </div>
                                </TabsContent>
                              ))}
                            </Tabs>
                          </div>
                        )}

                        {template.status !== 'APPROVED' && (
                          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                              {template.status === 'PENDING'
                                ? 'Este template esta aguardando aprovacao da Meta. O codigo de envio estara disponivel apos aprovacao.'
                                : 'Este template foi rejeitado pela Meta. Verifique as politicas e crie um novo template.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg mb-2">Nenhum template</h3>
              <p className="text-muted-foreground text-center mb-4">
                Crie um novo template ou sincronize da Meta
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Template
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Template Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Criar Novo Template</DialogTitle>
            <DialogDescription>
              Crie um template para enviar mensagens pelo WhatsApp Cloud API.
              O template sera enviado para aprovacao da Meta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Quick Templates */}
            <div className="space-y-2 p-4 border rounded-lg bg-blue-500/5">
              <Label>Modelos Prontos</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Clique para carregar um modelo pre-configurado (voce pode editar depois)
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadOrderDetailsTemplate}
                  className="text-xs"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Fatura ORDER_DETAILS (PIX+Boleto)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadLembreteTemplate}
                  className="text-xs"
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Lembrete de Vencimento
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadDisparoLivreTemplate}
                  className="text-xs"
                >
                  <Code className="h-3 w-3 mr-1" />
                  Disparo Livre (Texto)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                  className="text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Limpar
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome do Template *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="meu_template"
                />
                <p className="text-xs text-muted-foreground">
                  Apenas letras minusculas, numeros e underscores
                </p>
              </div>
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v: any) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">Utilidade (cobranças, avisos)</SelectItem>
                    <SelectItem value="MARKETING">Marketing (promocoes)</SelectItem>
                    <SelectItem value="AUTHENTICATION">Autenticacao (OTP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Idioma</Label>
              <Select
                value={formData.language}
                onValueChange={(v) => setFormData({ ...formData, language: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt_BR">Portugues (Brasil)</SelectItem>
                  <SelectItem value="en_US">Ingles (EUA)</SelectItem>
                  <SelectItem value="es">Espanhol</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Header */}
            <div className="space-y-2 p-4 border rounded-lg">
              <Label>Cabecalho (Header)</Label>
              <Select
                value={formData.headerType}
                onValueChange={(v: any) => setFormData({ ...formData, headerType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cabecalho</SelectItem>
                  <SelectItem value="TEXT">Texto</SelectItem>
                  <SelectItem value="DOCUMENT">Documento (PDF)</SelectItem>
                  <SelectItem value="IMAGE">Imagem</SelectItem>
                  <SelectItem value="VIDEO">Video</SelectItem>
                </SelectContent>
              </Select>
              {formData.headerType === 'TEXT' && (
                <Input
                  value={formData.headerContent}
                  onChange={(e) => setFormData({ ...formData, headerContent: e.target.value })}
                  placeholder="Texto do cabecalho"
                />
              )}
              {formData.headerType === 'DOCUMENT' && (
                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                  <strong>Aviso:</strong> Para criar template com PDF, e necessario primeiro fazer upload do documento na Meta.
                  Recomendamos criar SEM header de documento e enviar o PDF no momento do disparo.
                </div>
              )}
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label>Corpo da Mensagem (Body) *</Label>
              <Textarea
                value={formData.bodyText}
                onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
                placeholder="Ola {{1}}, sua fatura de R$ {{2}} vence em {{3}}.&#10;&#10;Use variaveis como {{1}}, {{2}}, {{3}} para dados dinamicos."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{1}}'}, {'{{2}}'}, {'{{3}}'}, etc. para variaveis dinamicas
              </p>
            </div>

            {/* Footer */}
            <div className="space-y-2">
              <Label>Rodape (Footer)</Label>
              <Input
                value={formData.footerText}
                onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
                placeholder="Ex: Nao responda esta mensagem"
              />
            </div>

            {/* Buttons */}
            <div className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <Label>Botoes (maximo 3)</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addButton}
                  disabled={buttons.length >= 3}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Botao
                </Button>
              </div>

              {buttons.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum botao adicionado. Botoes COPY_CODE sao uteis para Pix e Boleto.
                </p>
              )}

              {buttons.map((btn, idx) => (
                <div key={idx} className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Botao {idx + 1}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeButton(idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Select
                      value={btn.type}
                      onValueChange={(v: any) => updateButton(idx, 'type', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ORDER_DETAILS">Detalhes do Pedido (PIX+Boleto)</SelectItem>
                        <SelectItem value="COPY_CODE">Copiar Codigo (Pix/Boleto)</SelectItem>
                        <SelectItem value="QUICK_REPLY">Resposta Rapida</SelectItem>
                        <SelectItem value="URL">Link (URL)</SelectItem>
                        <SelectItem value="PHONE_NUMBER">Ligar</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={btn.text}
                      onChange={(e) => updateButton(idx, 'text', e.target.value)}
                      placeholder={btn.type === 'COPY_CODE' ? 'Copiar chave Pix' : 'Texto do botao'}
                    />
                  </div>
                  {btn.type === 'COPY_CODE' && (
                    <div className="space-y-1">
                      <Input
                        value={btn.example || ''}
                        onChange={(e) => updateButton(idx, 'example', e.target.value)}
                        placeholder="Codigo de exemplo para aprovacao"
                      />
                      <p className="text-xs text-muted-foreground">
                        Exemplo para aprovacao da Meta (nao aparece na mensagem)
                      </p>
                    </div>
                  )}
                  {btn.type === 'URL' && (
                    <Input
                      value={btn.url || ''}
                      onChange={(e) => updateButton(idx, 'url', e.target.value)}
                      placeholder="https://exemplo.com/{{1}}"
                    />
                  )}
                  {btn.type === 'PHONE_NUMBER' && (
                    <Input
                      value={btn.phoneNumber || ''}
                      onChange={(e) => updateButton(idx, 'phoneNumber', e.target.value)}
                      placeholder="+5511999999999"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Pre-visualizacao</Label>
              <div className="p-4 bg-[#e5ddd5] rounded-lg">
                <div className="bg-white rounded-lg p-3 max-w-sm shadow-sm">
                  {formData.headerType === 'DOCUMENT' && (
                    <div className="flex items-center gap-2 p-2 bg-gray-100 rounded mb-2">
                      <FileText className="h-5 w-5 text-red-500" />
                      <span className="text-sm">Documento PDF</span>
                    </div>
                  )}
                  {formData.headerType === 'TEXT' && formData.headerContent && (
                    <p className="font-bold text-sm mb-1">{formData.headerContent}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap">
                    {formData.bodyText || 'Digite o corpo da mensagem...'}
                  </p>
                  {formData.footerText && (
                    <p className="text-xs text-gray-500 mt-2">{formData.footerText}</p>
                  )}
                  {buttons.length > 0 && (
                    <div className="mt-3 space-y-1 border-t pt-2">
                      {buttons.map((btn, idx) => (
                        <div key={idx} className="text-center text-blue-500 text-sm py-1 border rounded">
                          {btn.text || `Botao ${idx + 1}`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {createError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">Erro ao criar template</p>
                  <pre className="text-sm text-red-700 mt-1 whitespace-pre-wrap font-mono">{createError}</pre>
                </div>
              </div>
            </div>
          )}

          {createSuccess && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <p className="text-green-800">{createSuccess}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateModal(false); setCreateError(null); setCreateSuccess(null); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateTemplate}
              disabled={!formData.name || !formData.bodyText || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
