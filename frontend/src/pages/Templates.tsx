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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import api from '@/services/api'
import type { Template } from '@/types'

const API_BASE_URL = import.meta.env.PROD
  ? 'https://apievo.sjnetwork.com.br'
  : window.location.origin

export function Templates() {
  const queryClient = useQueryClient()
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await api.get('/templates')
      return response.data
    },
  })

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
      AUTHENTICATION: 'Autenticação',
    }
    return categories[category] || category
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCode(id)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const generateCode = (template: Template, lang: 'curl' | 'javascript' | 'python' | 'php', token: string = 'SEU_TOKEN') => {
    const payload = {
      to: '5511999999999',
      templateName: template.name,
      language: template.language,
      components: [],
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
        "components" => []
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
              Clique em um template para ver o código de uso
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
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              )}
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
                            <h4 className="font-medium mb-2">Conteúdo do Template</h4>
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
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Informações</h4>
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
                              Código para Envio
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
                                ? 'Este template está aguardando aprovação da Meta. O código de envio estará disponível após aprovação.'
                                : 'Este template foi rejeitado pela Meta. Verifique as políticas e crie um novo template.'}
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
                Sincronize os templates da Meta na página de Instâncias
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
