import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Code,
  Copy,
  Check,
  Send,
  Image,
  FileText,
  Users,
  MessageSquare,
  Key,
  Terminal,
  Loader2,
  Play,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import api from '@/services/api'
import type { Instance, Template } from '@/types'

// URL para exibir nos exemplos de codigo
const API_EXTERNAL_URL = import.meta.env.VITE_API_URL || window.location.origin
// URL para testes internos
const API_TEST_URL = ''

interface Endpoint {
  id: string
  method: string
  path: string
  title: string
  description: string
  icon: any
  testable: boolean
  important?: boolean
  body?: Record<string, any>
  curl: string
  javascript: string
  python: string
  php: string
  response: any
}

export function ApiDocs() {
  const [selectedInstance, setSelectedInstance] = useState<string>('')
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null)
  const [showTestModal, setShowTestModal] = useState(false)
  const [testEndpoint, setTestEndpoint] = useState<any>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; data: any } | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  // Form states for testing
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [testMediaUrl, setTestMediaUrl] = useState('')
  const [testMediaType, setTestMediaType] = useState<'image' | 'video' | 'audio' | 'document'>('image')
  const [testCaption, setTestCaption] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [testLanguage, setTestLanguage] = useState('pt_BR')

  const { data: instances, isLoading } = useQuery<Instance[]>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  const { data: templates } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await api.get('/templates')
      return response.data
    },
  })

  const selectedInstanceData = instances?.find(i => i.id === selectedInstance)
  const apiToken = selectedInstanceData?.apiToken || 'SEU_TOKEN_AQUI'
  const instanceType = selectedInstanceData?.channel || null

  const copyToClipboard = (text: string, endpoint: string) => {
    navigator.clipboard.writeText(text)
    setCopiedEndpoint(endpoint)
    setTimeout(() => setCopiedEndpoint(null), 2000)
  }

  const openTestModal = (endpoint: any) => {
    setTestEndpoint(endpoint)
    setTestResult(null)
    setTestPhone('')
    setTestMessage('')
    setTestMediaUrl('')
    setTestCaption('')
    setSelectedTemplate('')
    setShowTestModal(true)
  }

  const runTest = async () => {
    if (!selectedInstance || !testEndpoint) return

    setTestLoading(true)
    setTestResult(null)

    try {
      let response
      // API externa usa x-api-token
      const apiHeaders = {
        'Content-Type': 'application/json',
        'x-api-token': apiToken,
      }

      // Rotas autenticadas usam JWT (pegar do zustand store)
      const authStorage = localStorage.getItem('auth-storage')
      const jwtToken = authStorage ? JSON.parse(authStorage)?.state?.token : null
      const jwtHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      }

      switch (testEndpoint.id) {
        case 'send-text':
        case 'send-text-cloud':
          response = await fetch(`${API_TEST_URL}/api/messages/api/send`, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify({ to: testPhone, text: testMessage }),
          })
          break

        case 'send-media':
        case 'send-media-cloud':
          response = await fetch(`${API_TEST_URL}/api/messages/api/send-media`, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify({
              to: testPhone,
              mediaType: testMediaType,
              mediaUrl: testMediaUrl,
              caption: testCaption,
            }),
          })
          break

        case 'send-template':
          response = await fetch(`${API_TEST_URL}/api/messages/api/send-template`, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify({
              to: testPhone,
              templateName: selectedTemplate,
              language: testLanguage,
              components: [],
            }),
          })
          break

        case 'get-groups':
          response = await fetch(`${API_TEST_URL}/api/instances/${selectedInstance}/groups`, {
            method: 'GET',
            headers: jwtHeaders,
          })
          break

        default:
          throw new Error('Endpoint nao suportado para teste')
      }

      const data = await response.json()
      setTestResult({
        success: response.ok,
        data,
      })
    } catch (error: any) {
      setTestResult({
        success: false,
        data: { error: error.message },
      })
    } finally {
      setTestLoading(false)
    }
  }

  // Endpoints para Baileys
  const baileysEndpoints = [
    {
      id: 'send-text',
      method: 'POST',
      path: '/api/messages/api/send',
      title: 'Enviar Mensagem de Texto',
      description: 'Envia uma mensagem de texto simples para um contato ou grupo',
      icon: Send,
      testable: true,
      body: {
        to: '5511999999999',
        text: 'Ola! Esta e uma mensagem de teste.',
      },
      curl: `curl -X POST "${API_EXTERNAL_URL}/api/messages/api/send" \\
  -H "Content-Type: application/json" \\
  -H "x-api-token: ${apiToken}" \\
  -d '{
    "to": "5511999999999",
    "text": "Ola! Esta e uma mensagem de teste."
  }'`,
      javascript: `const response = await fetch("${API_EXTERNAL_URL}/api/messages/api/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-token": "${apiToken}"
  },
  body: JSON.stringify({
    to: "5511999999999",
    text: "Ola! Esta e uma mensagem de teste."
  })
});

const data = await response.json();
console.log(data);`,
      python: `import requests

url = "${API_EXTERNAL_URL}/api/messages/api/send"
headers = {
    "Content-Type": "application/json",
    "x-api-token": "${apiToken}"
}
payload = {
    "to": "5511999999999",
    "text": "Ola! Esta e uma mensagem de teste."
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`,
      php: `<?php
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => "${API_EXTERNAL_URL}/api/messages/api/send",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "x-api-token: ${apiToken}"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "5511999999999",
        "text" => "Ola! Esta e uma mensagem de teste."
    ])
]);
$response = curl_exec($curl);
curl_close($curl);
echo $response;
?>`,
      response: { success: true, messageId: 'ABC123XYZ' },
    },
    {
      id: 'send-media',
      method: 'POST',
      path: '/api/messages/api/send-media',
      title: 'Enviar Midia (Imagem, Video, Audio, Documento)',
      description: 'Envia arquivos de midia via URL',
      icon: Image,
      testable: true,
      body: {
        to: '5511999999999',
        mediaType: 'image',
        mediaUrl: 'https://exemplo.com/imagem.jpg',
        caption: 'Legenda opcional',
      },
      curl: `curl -X POST "${API_EXTERNAL_URL}/api/messages/api/send-media" \\
  -H "Content-Type: application/json" \\
  -H "x-api-token: ${apiToken}" \\
  -d '{
    "to": "5511999999999",
    "mediaType": "image",
    "mediaUrl": "https://exemplo.com/imagem.jpg",
    "caption": "Legenda opcional"
  }'`,
      javascript: `// Tipos de midia: image, video, audio, document
const response = await fetch("${API_EXTERNAL_URL}/api/messages/api/send-media", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-token": "${apiToken}"
  },
  body: JSON.stringify({
    to: "5511999999999",
    mediaType: "image", // image | video | audio | document
    mediaUrl: "https://exemplo.com/imagem.jpg",
    caption: "Legenda opcional"
  })
});`,
      python: `import requests

# Tipos de midia: image, video, audio, document
url = "${API_EXTERNAL_URL}/api/messages/api/send-media"
headers = {
    "Content-Type": "application/json",
    "x-api-token": "${apiToken}"
}
payload = {
    "to": "5511999999999",
    "mediaType": "image",  # image | video | audio | document
    "mediaUrl": "https://exemplo.com/imagem.jpg",
    "caption": "Legenda opcional"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`,
      php: `<?php
// Tipos de midia: image, video, audio, document
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => "${API_EXTERNAL_URL}/api/messages/api/send-media",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "x-api-token: ${apiToken}"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "5511999999999",
        "mediaType" => "image", // image | video | audio | document
        "mediaUrl" => "https://exemplo.com/imagem.jpg",
        "caption" => "Legenda opcional"
    ])
]);
$response = curl_exec($curl);
curl_close($curl);
echo $response;
?>`,
      response: { success: true, messageId: 'DEF456XYZ' },
    },
    {
      id: 'get-groups',
      method: 'GET',
      path: '/api/instances/:id/groups',
      title: 'Listar Grupos',
      description: 'Retorna todos os grupos que a instancia participa',
      icon: Users,
      testable: true,
      curl: `curl -X GET "${API_EXTERNAL_URL}/api/instances/${selectedInstance || 'INSTANCE_ID'}/groups" \\
  -H "x-api-token: ${apiToken}"`,
      javascript: `const response = await fetch("${API_EXTERNAL_URL}/api/instances/${selectedInstance || 'INSTANCE_ID'}/groups", {
  method: "GET",
  headers: {
    "x-api-token": "${apiToken}"
  }
});

const groups = await response.json();
console.log(groups);
// Retorna: [{ id: "123@g.us", name: "Grupo", participants: 10 }]`,
      python: `import requests

url = "${API_EXTERNAL_URL}/api/instances/${selectedInstance || 'INSTANCE_ID'}/groups"
headers = { "x-api-token": "${apiToken}" }

response = requests.get(url, headers=headers)
groups = response.json()
print(groups)
# Retorna: [{ "id": "123@g.us", "name": "Grupo", "participants": 10 }]`,
      php: `<?php
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => "${API_EXTERNAL_URL}/api/instances/${selectedInstance || 'INSTANCE_ID'}/groups",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "x-api-token: ${apiToken}"
    ]
]);
$response = curl_exec($curl);
curl_close($curl);
echo $response;
// Retorna: [{ "id": "123@g.us", "name": "Grupo", "participants": 10 }]
?>`,
      response: [{ id: '123456789@g.us', name: 'Grupo de Vendas', participants: 45 }],
    },
  ]

  // Endpoints para Cloud API (Meta)
  const cloudApiEndpoints = [
    {
      id: 'send-template',
      method: 'POST',
      path: '/api/messages/api/send-template',
      title: 'Enviar Template (HSM)',
      description: 'Envia um template aprovado pela Meta. Obrigatorio para iniciar conversas.',
      icon: FileText,
      testable: true,
      important: true,
      body: {
        to: '5511999999999',
        templateName: 'hello_world',
        language: 'pt_BR',
        components: [],
      },
      curl: `curl -X POST "${API_EXTERNAL_URL}/api/messages/api/send-template" \\
  -H "Content-Type: application/json" \\
  -H "x-api-token: ${apiToken}" \\
  -d '{
    "to": "5511999999999",
    "templateName": "hello_world",
    "language": "pt_BR",
    "components": []
  }'`,
      javascript: `// IMPORTANTE: Templates devem ser aprovados pela Meta primeiro
const response = await fetch("${API_EXTERNAL_URL}/api/messages/api/send-template", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-token": "${apiToken}"
  },
  body: JSON.stringify({
    to: "5511999999999",
    templateName: "hello_world",
    language: "pt_BR",
    components: [] // Variaveis do template
  })
});`,
      python: `import requests

# IMPORTANTE: Templates devem ser aprovados pela Meta primeiro
url = "${API_EXTERNAL_URL}/api/messages/api/send-template"
headers = {
    "Content-Type": "application/json",
    "x-api-token": "${apiToken}"
}
payload = {
    "to": "5511999999999",
    "templateName": "hello_world",
    "language": "pt_BR",
    "components": []  # Variaveis do template
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`,
      php: `<?php
// IMPORTANTE: Templates devem ser aprovados pela Meta primeiro
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => "${API_EXTERNAL_URL}/api/messages/api/send-template",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "x-api-token: ${apiToken}"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "5511999999999",
        "templateName" => "hello_world",
        "language" => "pt_BR",
        "components" => [] // Variaveis do template
    ])
]);
$response = curl_exec($curl);
curl_close($curl);
echo $response;
?>`,
      response: { success: true, messageId: 'wamid.XXX' },
    },
    {
      id: 'send-text-cloud',
      method: 'POST',
      path: '/api/messages/api/send',
      title: 'Enviar Texto (Janela 24h)',
      description: 'Envia texto simples. So funciona dentro da janela de 24h apos mensagem do cliente.',
      icon: Send,
      testable: true,
      body: {
        to: '5511999999999',
        text: 'Ola! Resposta dentro da janela de 24h.',
      },
      curl: `curl -X POST "${API_EXTERNAL_URL}/api/messages/api/send" \\
  -H "Content-Type: application/json" \\
  -H "x-api-token: ${apiToken}" \\
  -d '{
    "to": "5511999999999",
    "text": "Ola! Resposta dentro da janela de 24h."
  }'`,
      javascript: `// ATENCAO: So funciona se o cliente enviou mensagem nas ultimas 24h
const response = await fetch("${API_EXTERNAL_URL}/api/messages/api/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-token": "${apiToken}"
  },
  body: JSON.stringify({
    to: "5511999999999",
    text: "Ola! Resposta dentro da janela de 24h."
  })
});`,
      python: `import requests

# ATENCAO: So funciona se o cliente enviou mensagem nas ultimas 24h
url = "${API_EXTERNAL_URL}/api/messages/api/send"
headers = {
    "Content-Type": "application/json",
    "x-api-token": "${apiToken}"
}
payload = {
    "to": "5511999999999",
    "text": "Ola! Resposta dentro da janela de 24h."
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`,
      php: `<?php
// ATENCAO: So funciona se o cliente enviou mensagem nas ultimas 24h
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => "${API_EXTERNAL_URL}/api/messages/api/send",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "x-api-token: ${apiToken}"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "5511999999999",
        "text" => "Ola! Resposta dentro da janela de 24h."
    ])
]);
$response = curl_exec($curl);
curl_close($curl);
echo $response;
?>`,
      response: { success: true, messageId: 'wamid.XXX' },
    },
    {
      id: 'send-media-cloud',
      method: 'POST',
      path: '/api/messages/api/send-media',
      title: 'Enviar Midia (Janela 24h)',
      description: 'Envia midia. So funciona dentro da janela de 24h.',
      icon: Image,
      testable: true,
      body: {
        to: '5511999999999',
        mediaType: 'image',
        mediaUrl: 'https://exemplo.com/imagem.jpg',
        caption: 'Legenda',
      },
      curl: `curl -X POST "${API_EXTERNAL_URL}/api/messages/api/send-media" \\
  -H "Content-Type: application/json" \\
  -H "x-api-token: ${apiToken}" \\
  -d '{
    "to": "5511999999999",
    "mediaType": "image",
    "mediaUrl": "https://exemplo.com/imagem.jpg",
    "caption": "Legenda"
  }'`,
      javascript: `// ATENCAO: So funciona dentro da janela de 24h
const response = await fetch("${API_EXTERNAL_URL}/api/messages/api/send-media", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-token": "${apiToken}"
  },
  body: JSON.stringify({
    to: "5511999999999",
    mediaType: "image",
    mediaUrl: "https://exemplo.com/imagem.jpg",
    caption: "Legenda"
  })
});`,
      python: `import requests

# ATENCAO: So funciona dentro da janela de 24h
url = "${API_EXTERNAL_URL}/api/messages/api/send-media"
headers = {
    "Content-Type": "application/json",
    "x-api-token": "${apiToken}"
}
payload = {
    "to": "5511999999999",
    "mediaType": "image",
    "mediaUrl": "https://exemplo.com/imagem.jpg",
    "caption": "Legenda"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`,
      php: `<?php
// ATENCAO: So funciona dentro da janela de 24h
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => "${API_EXTERNAL_URL}/api/messages/api/send-media",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "x-api-token: ${apiToken}"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "5511999999999",
        "mediaType" => "image",
        "mediaUrl" => "https://exemplo.com/imagem.jpg",
        "caption" => "Legenda"
    ])
]);
$response = curl_exec($curl);
curl_close($curl);
echo $response;
?>`,
      response: { success: true, messageId: 'wamid.XXX' },
    },
  ]

  const endpoints: Endpoint[] = instanceType === 'CLOUD_API' ? cloudApiEndpoints : instanceType === 'BAILEYS' ? baileysEndpoints : []

  const approvedTemplates = templates?.filter(t => t.status === 'APPROVED') || []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Documentacao da API</h2>
        <p className="text-muted-foreground">
          Integre o WhatsApp ao seu sistema. Selecione uma instancia para ver os endpoints disponiveis.
        </p>
      </div>

      {/* Instance Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Selecionar Instancia
          </CardTitle>
          <CardDescription>
            Os endpoints disponiveis dependem do tipo de conexao (Baileys ou Cloud API)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Carregando instancias...</span>
            </div>
          ) : (
            <>
              <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                <SelectTrigger className="w-full md:w-[400px]">
                  <SelectValue placeholder="Selecione uma instancia" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(instances) && instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      <div className="flex items-center gap-2">
                        <span>{instance.name}</span>
                        <Badge variant={instance.channel === 'CLOUD_API' ? 'default' : 'secondary'}>
                          {instance.channel === 'CLOUD_API' ? 'Cloud API (Meta)' : 'Baileys (QR)'}
                        </Badge>
                        <Badge variant={instance.status === 'CONNECTED' ? 'default' : 'outline'} className={instance.status === 'CONNECTED' ? 'bg-green-500' : ''}>
                          {instance.status === 'CONNECTED' ? 'Online' : 'Offline'}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedInstanceData && (
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">API Token:</p>
                      <code className="text-sm bg-background px-2 py-1 rounded mt-1 block break-all font-mono">
                        {selectedInstanceData.apiToken}
                      </code>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(selectedInstanceData.apiToken, 'token')}
                    >
                      {copiedEndpoint === 'token' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="text-sm">
                    <p><strong>Tipo:</strong> {instanceType === 'CLOUD_API' ? 'Cloud API (Meta Oficial)' : 'Baileys (Nao Oficial)'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Header: <code>x-api-token: {'{TOKEN}'}</code>
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Cloud API Info */}
      {instanceType === 'CLOUD_API' && (
        <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950">
          <CardHeader>
            <CardTitle className="text-blue-700 dark:text-blue-300">Cloud API - Informacoes Importantes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Janela de 24h:</strong> Voce so pode enviar mensagens livres se o cliente enviou mensagem nas ultimas 24 horas.</p>
            <p><strong>Templates:</strong> Para iniciar conversas, use templates aprovados pela Meta.</p>
            <p><strong>Webhook:</strong> Configure o webhook na Meta para receber mensagens. URL: <code>{API_EXTERNAL_URL}/api/webhook/cloud</code></p>
            <p><strong>Verify Token:</strong> Use o token configurado no seu .env (META_WEBHOOK_VERIFY_TOKEN)</p>
          </CardContent>
        </Card>
      )}

      {/* Baileys Info */}
      {instanceType === 'BAILEYS' && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950">
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-300">Baileys - Informacoes Importantes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Conexao:</strong> Mantenha o QR Code escaneado e o celular conectado a internet.</p>
            <p><strong>Sem limites de janela:</strong> Voce pode enviar mensagens a qualquer momento.</p>
            <p><strong>Grupos:</strong> Voce pode listar e enviar mensagens para grupos.</p>
            <p><strong>Atencao:</strong> Uso excessivo pode resultar em banimento pelo WhatsApp.</p>
          </CardContent>
        </Card>
      )}

      {/* No instance selected */}
      {!selectedInstance && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Code className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">Selecione uma instancia</h3>
            <p className="text-muted-foreground text-center">
              Escolha uma instancia acima para ver os endpoints disponiveis
            </p>
          </CardContent>
        </Card>
      )}

      {/* API Endpoints */}
      {selectedInstance && endpoints.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">
              Endpoints para {instanceType === 'CLOUD_API' ? 'Cloud API (Meta)' : 'Baileys'}
            </h3>
            {selectedInstanceData?.status !== 'CONNECTED' && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                Instancia desconectada - Conecte para testar
              </Badge>
            )}
          </div>

          {endpoints.map((endpoint) => (
            <Card key={endpoint.id} className={endpoint.important ? 'border-yellow-500' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <endpoint.icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {endpoint.title}
                        <Badge variant={endpoint.method === 'GET' ? 'secondary' : 'default'}>
                          {endpoint.method}
                        </Badge>
                        {endpoint.important && <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Recomendado</Badge>}
                      </CardTitle>
                      <code className="text-sm text-muted-foreground">{endpoint.path}</code>
                    </div>
                  </div>
                  {endpoint.testable && (
                    <Button
                      onClick={() => openTestModal(endpoint)}
                      variant="outline"
                      size="sm"
                      disabled={selectedInstanceData?.status !== 'CONNECTED'}
                      title={selectedInstanceData?.status !== 'CONNECTED' ? 'Conecte a instância para testar' : 'Testar endpoint'}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Testar
                    </Button>
                  )}
                </div>
                <CardDescription>{endpoint.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="curl" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="curl" className="flex items-center gap-1">
                      <Terminal className="h-3 w-3" />
                      cURL
                    </TabsTrigger>
                    <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                    <TabsTrigger value="python">Python</TabsTrigger>
                    <TabsTrigger value="php">PHP</TabsTrigger>
                  </TabsList>

                  {['curl', 'javascript', 'python', 'php'].map((lang) => (
                    <TabsContent key={lang} value={lang} className="mt-4">
                      <div className="relative">
                        <pre className="p-4 bg-zinc-950 text-zinc-100 rounded-lg overflow-x-auto text-sm max-h-96">
                          <code>{endpoint[lang as keyof typeof endpoint] as string}</code>
                        </pre>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-100"
                          onClick={() => copyToClipboard(endpoint[lang as keyof typeof endpoint] as string, `${endpoint.id}-${lang}`)}
                        >
                          {copiedEndpoint === `${endpoint.id}-${lang}` ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>

                {/* Response Example */}
                {endpoint.response && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Resposta de exemplo:</p>
                    <pre className="p-4 bg-green-950 text-green-100 rounded-lg overflow-x-auto text-sm">
                      <code>{JSON.stringify(endpoint.response, null, 2)}</code>
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Status Codes */}
      {selectedInstance && (
        <Card>
          <CardHeader>
            <CardTitle>Codigos de Status HTTP</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-3 p-2 rounded border">
                <Badge className="bg-green-500 w-12 justify-center">200</Badge>
                <span className="text-sm">Sucesso</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded border">
                <Badge className="bg-green-500 w-12 justify-center">201</Badge>
                <span className="text-sm">Criado com sucesso</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded border">
                <Badge className="bg-yellow-500 w-12 justify-center">400</Badge>
                <span className="text-sm">Requisicao invalida</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded border">
                <Badge className="bg-red-500 w-12 justify-center">401</Badge>
                <span className="text-sm">Token invalido</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded border">
                <Badge className="bg-red-500 w-12 justify-center">404</Badge>
                <span className="text-sm">Nao encontrado</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded border">
                <Badge className="bg-red-500 w-12 justify-center">500</Badge>
                <span className="text-sm">Erro do servidor</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Modal */}
      <Dialog open={showTestModal} onOpenChange={setShowTestModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Testar Endpoint: {testEndpoint?.title}
            </DialogTitle>
            <DialogDescription>
              Preencha os campos abaixo para testar o endpoint
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Phone Number - for send endpoints */}
            {['send-text', 'send-media', 'send-template', 'send-text-cloud', 'send-media-cloud'].includes(testEndpoint?.id) && (
              <div className="space-y-2">
                <Label htmlFor="testPhone">Numero de Telefone</Label>
                <Input
                  id="testPhone"
                  placeholder="5511999999999"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Formato: codigo do pais + DDD + numero (sem espacos ou caracteres)</p>
              </div>
            )}

            {/* Text Message */}
            {['send-text', 'send-text-cloud'].includes(testEndpoint?.id) && (
              <div className="space-y-2">
                <Label htmlFor="testMessage">Mensagem</Label>
                <Textarea
                  id="testMessage"
                  placeholder="Digite sua mensagem..."
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                />
              </div>
            )}

            {/* Media fields */}
            {['send-media', 'send-media-cloud'].includes(testEndpoint?.id) && (
              <>
                <div className="space-y-2">
                  <Label>Tipo de Midia</Label>
                  <Select value={testMediaType} onValueChange={(v: any) => setTestMediaType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">Imagem</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="audio">Audio</SelectItem>
                      <SelectItem value="document">Documento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="testMediaUrl">URL da Midia</Label>
                  <Input
                    id="testMediaUrl"
                    placeholder="https://exemplo.com/imagem.jpg"
                    value={testMediaUrl}
                    onChange={(e) => setTestMediaUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="testCaption">Legenda (opcional)</Label>
                  <Input
                    id="testCaption"
                    placeholder="Legenda da midia"
                    value={testCaption}
                    onChange={(e) => setTestCaption(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Template selector for Cloud API */}
            {testEndpoint?.id === 'send-template' && (
              <>
                <div className="space-y-2">
                  <Label>Template Aprovado</Label>
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um template" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvedTemplates.length > 0 ? (
                        approvedTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.name}>
                            {template.name} ({template.language})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="_none" disabled>Nenhum template aprovado</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {approvedTemplates.length === 0 && (
                    <p className="text-xs text-yellow-600">Crie templates na pagina de Templates e aguarde aprovacao da Meta</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Idioma</Label>
                  <Select value={testLanguage} onValueChange={setTestLanguage}>
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
              </>
            )}

            {/* Test Result */}
            {testResult && (
              <div className={`p-4 rounded-lg ${testResult.success ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {testResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-medium">{testResult.success ? 'Sucesso!' : 'Erro'}</span>
                </div>
                <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestModal(false)}>
              Fechar
            </Button>
            <Button onClick={runTest} disabled={testLoading}>
              {testLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Executar Teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
