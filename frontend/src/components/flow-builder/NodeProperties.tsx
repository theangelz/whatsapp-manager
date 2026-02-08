import { useState, useEffect, useRef, useCallback } from 'react'
import { Node } from 'reactflow'
import api from '@/services/api'
import { X, Plus, Trash2, Play, Loader2, CheckCircle, XCircle, Variable, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FlowNodeData, FlowNodeType } from '@/types'

interface NodePropertiesProps {
  node: Node<FlowNodeData> | null
  onUpdate: (nodeId: string, data: FlowNodeData) => void
  onClose: () => void
  allNodes?: Node<FlowNodeData>[] // Para pegar variáveis de outros nodes
}

// Available system variables
const SYSTEM_VARIABLES = [
  { name: '_contactName', description: 'Nome do contato no WhatsApp', category: 'sistema' },
  { name: '_contactPhone', description: 'Telefone do contato', category: 'sistema' },
  { name: '_lastInput', description: 'Última resposta do usuário', category: 'sistema' },
  { name: '_menuSelection', description: 'Opção selecionada no menu', category: 'sistema' },
  { name: '_menuLabel', description: 'Label da opção selecionada', category: 'sistema' },
  { name: '_buttonId', description: 'ID do botão clicado', category: 'sistema' },
  { name: '_listRowId', description: 'ID do item de lista', category: 'sistema' },
  { name: '_triggerMessage', description: 'Mensagem que iniciou o fluxo', category: 'sistema' },
]

// Variable Input Component with autocomplete
interface VariableInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
  rows?: number
  userVariables?: Array<{ name: string; description?: string }>
}

function VariableInput({ value, onChange, placeholder, multiline = false, rows = 4, userVariables = [] }: VariableInputProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [filter, setFilter] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Combine system and user variables
  const allVariables = [
    ...SYSTEM_VARIABLES,
    ...userVariables.map(v => ({ ...v, category: 'usuario' })),
  ]

  const filteredVariables = allVariables.filter(v =>
    v.name.toLowerCase().includes(filter.toLowerCase()) ||
    v.description?.toLowerCase().includes(filter.toLowerCase())
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as HTMLElement) &&
          inputRef.current && !inputRef.current.contains(e.target as HTMLElement)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const newValue = e.target.value
    const cursor = e.target.selectionStart || 0
    onChange(newValue)
    setCursorPosition(cursor)

    // Check if we should show autocomplete
    const textBeforeCursor = newValue.slice(0, cursor)
    const match = textBeforeCursor.match(/\{\{([^}]*)$/)
    if (match) {
      setFilter(match[1])
      setShowDropdown(true)
    } else {
      setShowDropdown(false)
    }
  }

  const insertVariable = (varName: string) => {
    const textBeforeCursor = value.slice(0, cursorPosition)
    const textAfterCursor = value.slice(cursorPosition)

    // Find where {{ starts
    const match = textBeforeCursor.match(/\{\{([^}]*)$/)
    if (match) {
      const startPos = textBeforeCursor.lastIndexOf('{{')
      const newValue = value.slice(0, startPos) + `{{${varName}}}` + textAfterCursor
      onChange(newValue)
    } else {
      // Just insert at cursor
      const newValue = textBeforeCursor + `{{${varName}}}` + textAfterCursor
      onChange(newValue)
    }
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <div className="relative">
        {multiline ? (
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={handleInputChange}
            placeholder={placeholder}
            rows={rows}
            className="pr-10"
          />
        ) : (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={value}
            onChange={handleInputChange}
            placeholder={placeholder}
            className="pr-10"
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1 h-7 w-7 p-0"
          onClick={() => {
            setFilter('')
            setShowDropdown(!showDropdown)
          }}
        >
          <Variable className="h-4 w-4 text-purple-500" />
        </Button>
      </div>

      {/* Variable Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-48 overflow-auto"
        >
          {filteredVariables.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">Nenhuma variável encontrada</div>
          ) : (
            <>
              {/* Sistema */}
              {filteredVariables.some(v => v.category === 'sistema') && (
                <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase bg-gray-50 dark:bg-zinc-800 sticky top-0">
                  Sistema
                </div>
              )}
              {filteredVariables.filter(v => v.category === 'sistema').map(v => (
                <button
                  key={v.name}
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center justify-between"
                  onClick={() => insertVariable(v.name)}
                >
                  <span className="font-mono text-sm text-purple-600 dark:text-purple-400">{`{{${v.name}}}`}</span>
                  <span className="text-xs text-gray-400 truncate ml-2">{v.description}</span>
                </button>
              ))}

              {/* Usuario */}
              {filteredVariables.some(v => v.category === 'usuario') && (
                <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase bg-gray-50 dark:bg-zinc-800 sticky top-0">
                  Suas Variáveis
                </div>
              )}
              {filteredVariables.filter(v => v.category === 'usuario').map(v => (
                <button
                  key={v.name}
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center justify-between"
                  onClick={() => insertVariable(v.name)}
                >
                  <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400">{`{{${v.name}}}`}</span>
                  <span className="text-xs text-gray-400 truncate ml-2">{v.description}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Variable Picker Button - for inserting variables with a button
interface VariablePickerProps {
  onSelect: (variable: string) => void
  userVariables?: Array<{ name: string; description?: string }>
}

function VariablePicker({ onSelect, userVariables = [] }: VariablePickerProps) {
  const allVariables = [
    ...SYSTEM_VARIABLES,
    ...userVariables.map(v => ({ ...v, category: 'usuario' as const })),
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
          <Variable className="h-3 w-3" />
          Variável
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 max-h-60 overflow-auto" align="end">
        <DropdownMenuLabel className="text-[10px] text-gray-400 uppercase">Sistema</DropdownMenuLabel>
        {allVariables.filter(v => v.category === 'sistema').map(v => (
          <DropdownMenuItem
            key={v.name}
            onClick={() => onSelect(`{{${v.name}}}`)}
            className="flex flex-col items-start cursor-pointer"
          >
            <span className="font-mono text-sm text-purple-600 dark:text-purple-400">{v.name}</span>
            <span className="text-xs text-gray-400">{v.description}</span>
          </DropdownMenuItem>
        ))}

        {userVariables.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] text-gray-400 uppercase">Suas Variáveis</DropdownMenuLabel>
            {userVariables.map(v => (
              <DropdownMenuItem
                key={v.name}
                onClick={() => onSelect(`{{${v.name}}}`)}
                className="flex flex-col items-start cursor-pointer"
              >
                <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400">{v.name}</span>
                {v.description && <span className="text-xs text-gray-400">{v.description}</span>}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Helper: extract all paths from a JSON object for clickable mapping
function extractJsonPaths(obj: any, prefix = ''): Array<{ path: string; value: any; type: string }> {
  const paths: Array<{ path: string; value: any; type: string }> = []
  if (obj === null || obj === undefined) return paths

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      const currentPath = prefix ? `${prefix}.${idx}` : `${idx}`
      if (typeof item === 'object' && item !== null) {
        paths.push(...extractJsonPaths(item, currentPath))
      } else {
        paths.push({ path: currentPath, value: item, type: typeof item })
      }
    })
  } else if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const currentPath = prefix ? `${prefix}.${key}` : key
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        paths.push(...extractJsonPaths(obj[key], currentPath))
      } else {
        paths.push({ path: currentPath, value: obj[key], type: typeof obj[key] })
      }
    }
  }
  return paths
}

// HTTP Test Button Component with clickable response mapping
function HttpTestButton({
  httpConfig,
  onAddMapping,
}: {
  httpConfig?: { method?: string; url?: string; headers?: Array<{ key: string; value: string }>; body?: string }
  onAddMapping?: (path: string) => void
}) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; status?: number; data?: any; error?: string } | null>(null)

  const handleTest = async () => {
    if (!httpConfig?.url) {
      setResult({ success: false, error: 'URL é obrigatória' })
      return
    }

    setTesting(true)
    setResult(null)

    try {
      const headersObj: Record<string, string> = {}
      if (httpConfig.headers) {
        httpConfig.headers.forEach(h => {
          if (h.key) headersObj[h.key] = h.value
        })
      }

      // Use backend proxy to avoid CORS issues
      const { data: proxyResult } = await api.post('/flows/test-http', {
        url: httpConfig.url,
        method: httpConfig.method || 'GET',
        headers: headersObj,
        body: httpConfig.body,
      })

      setResult({
        success: proxyResult.success,
        status: proxyResult.status,
        data: proxyResult.data,
        error: proxyResult.error,
      })
    } catch (error: any) {
      setResult({ success: false, error: error.message || 'Erro ao fazer requisição' })
    } finally {
      setTesting(false)
    }
  }

  const responsePaths = result?.data && typeof result.data === 'object'
    ? extractJsonPaths(result.data)
    : []

  return (
    <div className="space-y-2 pt-2 border-t">
      <Button
        onClick={handleTest}
        disabled={testing || !httpConfig?.url}
        className="w-full"
        variant="outline"
      >
        {testing ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testando...</>
        ) : (
          <><Play className="h-4 w-4 mr-2" />Testar Requisição</>
        )}
      </Button>
      <p className="text-[10px] text-muted-foreground">
        Variáveis {'{{}}'} não são substituídas no teste. Use valores reais para testar.
      </p>

      {result && (
        <div className={`p-3 rounded-lg text-sm ${
          result.success
            ? 'bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800'
            : 'bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {result.success ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <span className={result.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
              {result.success ? `Sucesso (${result.status})` : `Erro${result.status ? ` (${result.status})` : ''}`}
            </span>
          </div>
          {result.error && (
            <p className="text-red-600 dark:text-red-400 text-xs">{result.error}</p>
          )}

          {/* Clickable response fields */}
          {responsePaths.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">
                Clique num campo para mapear como variável:
              </p>
              <div className="bg-white dark:bg-zinc-900 border rounded max-h-48 overflow-auto">
                {responsePaths.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="w-full px-2 py-1.5 text-left hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border-b last:border-b-0 border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2"
                    onClick={() => onAddMapping?.(item.path)}
                  >
                    <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400 shrink-0">
                      {item.path}
                    </span>
                    <span className="text-[10px] text-gray-400 truncate text-right">
                      {String(item.value).slice(0, 40)}{String(item.value).length > 40 ? '...' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Raw response fallback for non-object or error */}
          {result.data && responsePaths.length === 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Resposta:</p>
              <pre className="text-xs bg-white dark:bg-zinc-900 p-2 rounded overflow-auto max-h-32 border">
                {typeof result.data === 'string'
                  ? result.data.slice(0, 500)
                  : JSON.stringify(result.data, null, 2).slice(0, 500)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function NodeProperties({ node, onUpdate, onClose, allNodes = [] }: NodePropertiesProps) {
  const [data, setData] = useState<FlowNodeData>({})

  useEffect(() => {
    if (node) {
      setData(node.data || {})
    }
  }, [node])

  if (!node) return null

  const handleChange = (key: string, value: any) => {
    const newData = { ...data, [key]: value }
    setData(newData)
    onUpdate(node.id, newData)
  }

  // Collect user-defined variables from all nodes
  const getUserVariables = useCallback((): Array<{ name: string; description?: string }> => {
    const variables: Array<{ name: string; description?: string }> = []

    allNodes.forEach(n => {
      const nodeData = n.data as FlowNodeData

      // SET_VARIABLE nodes
      if (n.type === 'SET_VARIABLE' && nodeData.variable) {
        variables.push({
          name: nodeData.variable,
          description: `Variável definida no fluxo`,
        })
      }

      // HTTP_REQUEST response mappings
      if (n.type === 'HTTP_REQUEST' && nodeData.httpConfig?.responseMappings) {
        nodeData.httpConfig.responseMappings.forEach((m: { variable: string }) => {
          if (m.variable) {
            variables.push({
              name: m.variable,
              description: `Resposta HTTP`,
            })
          }
        })
      }

      // HTTP_REQUEST responseVariable (legacy)
      if (n.type === 'HTTP_REQUEST' && nodeData.httpConfig?.responseVariable) {
        variables.push({
          name: nodeData.httpConfig.responseVariable,
          description: `Resposta HTTP completa`,
        })
      }
    })

    // Remove duplicates
    return variables.filter((v, i, arr) => arr.findIndex(x => x.name === v.name) === i)
  }, [allNodes])

  const nodeType = node.type as FlowNodeType

  const renderFields = () => {
    switch (nodeType) {
      case 'START':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                placeholder="Inicio"
              />
            </div>
          </div>
        )

      case 'MESSAGE':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Mensagem</Label>
                <VariablePicker
                  onSelect={(v) => handleChange('content', (data.content || '') + v)}
                  userVariables={getUserVariables()}
                />
              </div>
              <VariableInput
                value={data.content || ''}
                onChange={(value) => handleChange('content', value)}
                placeholder="Olá {{_contactName}}! Digite sua mensagem..."
                multiline
                rows={4}
                userVariables={getUserVariables()}
              />
              <p className="text-xs text-muted-foreground">
                Digite <code className="bg-gray-100 dark:bg-zinc-800 px-1 rounded">{'{{'}</code> para ver variáveis disponíveis
              </p>
            </div>

            {/* Wait for input toggle */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Aguardar resposta</Label>
                  <p className="text-[10px] text-muted-foreground">Espera o cliente digitar antes de continuar</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleChange('waitForInput', !data.waitForInput)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${data.waitForInput ? 'bg-purple-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${data.waitForInput ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {data.waitForInput && (
                <div className="space-y-2">
                  <Label>Salvar resposta na variável</Label>
                  <Input
                    value={data.inputVariable || ''}
                    onChange={(e) => handleChange('inputVariable', e.target.value)}
                    placeholder="ex: sn, nome, cpf..."
                    className="font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    O que o cliente digitar será salvo em <code className="bg-gray-100 dark:bg-zinc-800 px-1 rounded">{`{{${data.inputVariable || 'variavel'}}}`}</code> para usar nos próximos nós
                  </p>
                </div>
              )}
            </div>
          </div>
        )

      case 'IMAGE':
      case 'VIDEO':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL da Midia</Label>
              <Input
                value={data.mediaUrl || ''}
                onChange={(e) => handleChange('mediaUrl', e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Legenda (opcional)</Label>
              <Textarea
                value={data.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Legenda da imagem..."
                rows={2}
              />
            </div>
          </div>
        )

      case 'AUDIO':
      case 'DOCUMENT':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Arquivo</Label>
              <Input
                value={data.mediaUrl || ''}
                onChange={(e) => handleChange('mediaUrl', e.target.value)}
                placeholder="https://..."
              />
            </div>
            {nodeType === 'DOCUMENT' && (
              <div className="space-y-2">
                <Label>Nome do Arquivo</Label>
                <Input
                  value={data.fileName || ''}
                  onChange={(e) => handleChange('fileName', e.target.value)}
                  placeholder="documento.pdf"
                />
              </div>
            )}
          </div>
        )

      case 'MENU':
        const menuOptions = data.menuOptions || []
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Mensagem do Menu</Label>
                <VariablePicker
                  onSelect={(v) => handleChange('content', (data.content || '') + v)}
                  userVariables={getUserVariables()}
                />
              </div>
              <VariableInput
                value={data.content || ''}
                onChange={(value) => handleChange('content', value)}
                placeholder="Olá {{_contactName}}! O que você deseja?"
                multiline
                rows={3}
                userVariables={getUserVariables()}
              />
              <p className="text-xs text-muted-foreground">
                Digite <code className="bg-gray-100 dark:bg-zinc-800 px-1 rounded">{'{{'}</code> para ver variáveis
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Opções</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const nextNum = menuOptions.length + 1
                    const newOptions = [...menuOptions, { id: `opt_${Date.now()}`, trigger: String(nextNum), label: '' }]
                    handleChange('menuOptions', newOptions)
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Trigger = o que o usuario digita (ex: 1, 2, sim, nao)
              </p>
              {menuOptions.map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <Input
                    value={opt.trigger}
                    onChange={(e) => {
                      const newOptions = [...menuOptions]
                      newOptions[i] = { ...opt, trigger: e.target.value }
                      handleChange('menuOptions', newOptions)
                    }}
                    placeholder="1"
                    className="w-16"
                  />
                  <Input
                    value={opt.label}
                    onChange={(e) => {
                      const newOptions = [...menuOptions]
                      newOptions[i] = { ...opt, label: e.target.value }
                      handleChange('menuOptions', newOptions)
                    }}
                    placeholder="Suporte"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const newOptions = menuOptions.filter((_, idx) => idx !== i)
                      handleChange('menuOptions', newOptions)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
              {menuOptions.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  💡 Saída "outro" é usada quando a resposta não bate com nenhuma opção
                </p>
              )}
            </div>
          </div>
        )

      case 'BUTTONS':
        const buttons = data.buttons || []
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={data.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Escolha uma opcao:"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Botoes (max 3)</Label>
                {buttons.length < 3 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const newButtons = [...buttons, { id: `btn_${Date.now()}`, text: '' }]
                      handleChange('buttons', newButtons)
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {buttons.map((btn, i) => (
                <div key={btn.id} className="flex items-center gap-2">
                  <Input
                    value={btn.text}
                    onChange={(e) => {
                      const newButtons = [...buttons]
                      newButtons[i] = { ...btn, text: e.target.value }
                      handleChange('buttons', newButtons)
                    }}
                    placeholder={`Botao ${i + 1}`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const newButtons = buttons.filter((_, idx) => idx !== i)
                      handleChange('buttons', newButtons)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )

      case 'LIST':
        const sections = data.listSections || []
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={data.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Escolha uma opcao do menu:"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto do Botao</Label>
              <Input
                value={data.buttonText || ''}
                onChange={(e) => handleChange('buttonText', e.target.value)}
                placeholder="Ver opcoes"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Secoes</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const newSections = [...sections, { title: '', rows: [] }]
                    handleChange('listSections', newSections)
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {sections.map((section, sIdx) => (
                <div key={sIdx} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={section.title}
                      onChange={(e) => {
                        const newSections = [...sections]
                        newSections[sIdx] = { ...section, title: e.target.value }
                        handleChange('listSections', newSections)
                      }}
                      placeholder="Titulo da secao"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const newSections = sections.filter((_, idx) => idx !== sIdx)
                        handleChange('listSections', newSections)
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                  <div className="pl-4 space-y-1">
                    {section.rows.map((row, rIdx) => (
                      <div key={rIdx} className="flex items-center gap-2">
                        <Input
                          value={row.title}
                          onChange={(e) => {
                            const newSections = [...sections]
                            newSections[sIdx].rows[rIdx] = { ...row, title: e.target.value }
                            handleChange('listSections', newSections)
                          }}
                          placeholder="Opcao"
                          className="flex-1 text-sm"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const newSections = [...sections]
                            newSections[sIdx].rows = section.rows.filter((_, idx) => idx !== rIdx)
                            handleChange('listSections', newSections)
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => {
                        const newSections = [...sections]
                        newSections[sIdx].rows = [
                          ...section.rows,
                          { id: `row_${Date.now()}`, title: '' },
                        ]
                        handleChange('listSections', newSections)
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Adicionar opcao
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      case 'CONDITION':
        const condCases = data.condition?.cases || []
        const updateCondition = (patch: Record<string, any>) => {
          handleChange('condition', { ...data.condition, cases: condCases, ...patch })
        }
        const addCase = () => {
          const newCase = { id: `case_${Date.now()}`, value: '' }
          updateCondition({ cases: [...condCases, newCase] })
        }
        const removeCase = (id: string) => {
          updateCondition({ cases: condCases.filter((c: any) => c.id !== id) })
        }
        const updateCase = (id: string, value: string) => {
          updateCondition({ cases: condCases.map((c: any) => c.id === id ? { ...c, value } : c) })
        }

        return (
          <div className="space-y-4">
            {/* Variable selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Variável</Label>
                <VariablePicker
                  onSelect={(v) => {
                    const name = v.replace(/\{\{|\}\}/g, '')
                    updateCondition({ variable: name })
                  }}
                  userVariables={getUserVariables()}
                />
              </div>
              <Select
                value={data.condition?.variable || ''}
                onValueChange={(value) => updateCondition({ variable: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma variável..." />
                </SelectTrigger>
                <SelectContent>
                  {getUserVariables().map(v => (
                    <SelectItem key={v.name} value={v.name}>
                      <span className="font-mono text-emerald-600">{v.name}</span>
                      {v.description && <span className="text-gray-400 text-xs ml-2">({v.description})</span>}
                    </SelectItem>
                  ))}
                  <SelectItem value="_lastInput">
                    <span className="font-mono text-purple-600">_lastInput</span>
                    <span className="text-gray-400 text-xs ml-2">(Última mensagem)</span>
                  </SelectItem>
                  <SelectItem value="_contactName">
                    <span className="font-mono text-purple-600">_contactName</span>
                    <span className="text-gray-400 text-xs ml-2">(Nome contato)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {data.condition?.variable && (
                <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                  Verificando: <span className="text-amber-600 font-semibold">{data.condition.variable}</span>
                </p>
              )}
            </div>

            {/* Operator */}
            <div className="space-y-2">
              <Label>Operador</Label>
              <Select
                value={data.condition?.operator || 'equals'}
                onValueChange={(value) => updateCondition({ operator: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Igual a</SelectItem>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="startsWith">Começa com</SelectItem>
                  <SelectItem value="endsWith">Termina com</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                  <SelectItem value="exists">Existe</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cases - multiple values */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Valores (saídas)</Label>
                <Button variant="outline" size="sm" onClick={addCase} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Cada valor gera uma saída separada. Se nenhum corresponder, vai pro fallback.
              </p>
              <div className="space-y-2">
                {condCases.map((c: any, i: number) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <VariableInput
                        value={c.value}
                        onChange={(val) => updateCase(c.id, val)}
                        placeholder="ex: true, false, erro..."
                        userVariables={getUserVariables()}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCase(c.id)}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {/* Fallback row (always present, not removable) */}
                <div className="flex items-center gap-2 opacity-60">
                  <span className="w-6 h-6 rounded-full bg-gray-400 text-white text-xs flex items-center justify-center font-bold shrink-0">∅</span>
                  <div className="flex-1 min-w-0 px-3 py-2 border rounded-md bg-muted text-xs text-muted-foreground italic">
                    fallback (nenhum valor corresponde)
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'DELAY':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tempo (segundos)</Label>
              <Input
                type="number"
                min={1}
                max={300}
                value={data.delay || 1}
                onChange={(e) => handleChange('delay', parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
        )

      case 'SET_VARIABLE':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Variavel</Label>
              <Input
                value={data.variable || ''}
                onChange={(e) => handleChange('variable', e.target.value)}
                placeholder="nome_cliente"
              />
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                value={data.value || ''}
                onChange={(e) => handleChange('value', e.target.value)}
                placeholder="{{_lastInput}}"
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{_lastInput}}'} para salvar a ultima resposta
              </p>
            </div>
          </div>
        )

      case 'HTTP_REQUEST':
        const headers = data.httpConfig?.headers || []
        const responseMappings = data.httpConfig?.responseMappings || []
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Metodo</Label>
              <Select
                value={data.httpConfig?.method || 'GET'}
                onValueChange={(value) =>
                  handleChange('httpConfig', { ...data.httpConfig, method: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <VariableInput
                value={data.httpConfig?.url || ''}
                onChange={(value) =>
                  handleChange('httpConfig', { ...data.httpConfig, url: value })
                }
                placeholder="https://api.exemplo.com/{{variavel}}"
                userVariables={getUserVariables()}
              />
            </div>

            {/* Headers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Headers</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const newHeaders = [...headers, { key: '', value: '' }]
                    handleChange('httpConfig', { ...data.httpConfig, headers: newHeaders })
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {headers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum header. Clique + para adicionar.
                </p>
              )}
              {headers.map((header: { key: string; value: string }, i: number) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={header.key}
                      onChange={(e) => {
                        const newHeaders = [...headers]
                        newHeaders[i] = { ...header, key: e.target.value }
                        handleChange('httpConfig', { ...data.httpConfig, headers: newHeaders })
                      }}
                      placeholder="Authorization"
                      className="w-[45%]"
                    />
                    <div className="flex-1 min-w-0">
                      <VariableInput
                        value={header.value}
                        onChange={(value) => {
                          const newHeaders = [...headers]
                          newHeaders[i] = { ...header, value: value }
                          handleChange('httpConfig', { ...data.httpConfig, headers: newHeaders })
                        }}
                        placeholder="Bearer {{token}}"
                        userVariables={getUserVariables()}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => {
                        const newHeaders = headers.filter((_: any, idx: number) => idx !== i)
                        handleChange('httpConfig', { ...data.httpConfig, headers: newHeaders })
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Body (JSON)</Label>
                <VariablePicker
                  onSelect={(v) => {
                    const current = data.httpConfig?.body || ''
                    handleChange('httpConfig', { ...data.httpConfig, body: current + v })
                  }}
                  userVariables={getUserVariables()}
                />
              </div>
              <Textarea
                value={data.httpConfig?.body || ''}
                onChange={(e) =>
                  handleChange('httpConfig', { ...data.httpConfig, body: e.target.value })
                }
                placeholder='{"phone": "{{_contactPhone}}", "name": "{{_contactName}}"}'
                rows={3}
              />
            </div>

            {/* Response Mappings - salvar campos específicos */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-emerald-600">Salvar da Resposta</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const newMappings = [...responseMappings, { path: '', variable: '' }]
                    handleChange('httpConfig', { ...data.httpConfig, responseMappings: newMappings })
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Mapeie campos da resposta JSON para variáveis
              </p>
              {responseMappings.length === 0 && (
                <div className="text-xs text-gray-400 bg-gray-50 dark:bg-zinc-800 p-2 rounded">
                  Clique + para mapear campos. Ex: <code className="bg-gray-200 dark:bg-zinc-700 px-1 rounded">data.id</code> → <code className="bg-emerald-100 dark:bg-emerald-900 px-1 rounded text-emerald-700 dark:text-emerald-300">pedido_id</code>
                </div>
              )}
              {responseMappings.map((mapping: { path: string; variable: string }, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={mapping.path}
                    onChange={(e) => {
                      const newMappings = [...responseMappings]
                      newMappings[i] = { ...mapping, path: e.target.value }
                      handleChange('httpConfig', { ...data.httpConfig, responseMappings: newMappings })
                    }}
                    placeholder="data.user.name"
                    className="flex-1 font-mono text-xs"
                  />
                  <span className="text-gray-400">→</span>
                  <Input
                    value={mapping.variable}
                    onChange={(e) => {
                      const newMappings = [...responseMappings]
                      newMappings[i] = { ...mapping, variable: e.target.value }
                      handleChange('httpConfig', { ...data.httpConfig, responseMappings: newMappings })
                    }}
                    placeholder="nome_usuario"
                    className="flex-1 font-mono text-xs text-emerald-600"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const newMappings = responseMappings.filter((_: any, idx: number) => idx !== i)
                      handleChange('httpConfig', { ...data.httpConfig, responseMappings: newMappings })
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Test Button */}
            <HttpTestButton
              httpConfig={data.httpConfig}
              onAddMapping={(path) => {
                const currentMappings = data.httpConfig?.responseMappings || []
                // Don't add if path already mapped
                if (currentMappings.some((m: any) => m.path === path)) return
                const varName = path.replace(/\./g, '_').replace(/\d+_?/g, '')
                const newMappings = [...currentMappings, { path, variable: varName || 'valor' }]
                handleChange('httpConfig', { ...data.httpConfig, responseMappings: newMappings })
              }}
            />
          </div>
        )

      case 'TRANSFER':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem de Transferencia</Label>
              <Textarea
                value={data.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Aguarde, estou transferindo para um atendente..."
                rows={2}
              />
            </div>
          </div>
        )

      case 'END':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mensagem Final (opcional)</Label>
              <Textarea
                value={data.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Obrigado pelo contato!"
                rows={2}
              />
            </div>

            {/* Audit - WhatsApp Group */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="auditEnabled"
                  checked={!!data.auditEnabled}
                  onChange={(e) => handleChange('auditEnabled', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="auditEnabled" className="cursor-pointer font-medium">
                  Resumo via WhatsApp
                </Label>
              </div>

              {data.auditEnabled && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Grupo/Numero destino</Label>
                    <Input
                      value={data.auditGroupJid || ''}
                      onChange={(e) => handleChange('auditGroupJid', e.target.value)}
                      placeholder="120363...@g.us ou 5521999999999"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mensagem</Label>
                    <Textarea
                      value={data.auditMessage || ''}
                      onChange={(e) => handleChange('auditMessage', e.target.value)}
                      placeholder={"*Resumo*\nFluxo: {{_flowName}}\nContato: {{_contactName}}\nDuracao: {{_duration}}"}
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">
                      Variaveis: {"{{_flowName}}, {{_contactName}}, {{_contactPhone}}, {{_startedAt}}, {{_endedAt}}, {{_duration}}"} + variaveis do fluxo.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Audit - Webhook HTTP */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="auditWebhookEnabled"
                  checked={!!data.auditWebhookEnabled}
                  onChange={(e) => handleChange('auditWebhookEnabled', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="auditWebhookEnabled" className="cursor-pointer font-medium">
                  Webhook HTTP (auditoria)
                </Label>
              </div>

              {data.auditWebhookEnabled && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Metodo</Label>
                    <Select
                      value={data.auditWebhookMethod || 'POST'}
                      onValueChange={(v) => handleChange('auditWebhookMethod', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input
                      value={data.auditWebhookUrl || ''}
                      onChange={(e) => handleChange('auditWebhookUrl', e.target.value)}
                      placeholder="https://api.exemplo.com/webhook"
                    />
                    <p className="text-xs text-muted-foreground">
                      Aceita variaveis: {"{{variavel}}"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Headers (JSON)</Label>
                    <Textarea
                      value={data.auditWebhookHeaders || ''}
                      onChange={(e) => handleChange('auditWebhookHeaders', e.target.value)}
                      placeholder={'{"Content-Type": "application/json",\n"Authorization": "Bearer {{access_token}}"}'}
                      rows={3}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Body (JSON)</Label>
                    <Textarea
                      value={data.auditWebhookBody || ''}
                      onChange={(e) => handleChange('auditWebhookBody', e.target.value)}
                      placeholder={'{\n  "flow": "{{_flowName}}",\n  "contact": "{{_contactPhone}}",\n  "sn": "{{sn}}",\n  "result": "{{messageProvi}}",\n  "duration": "{{_duration}}"\n}'}
                      rows={8}
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Variaveis: {"{{_flowName}}, {{_contactName}}, {{_contactPhone}}, {{_startedAt}}, {{_endedAt}}, {{_duration}}"} + variaveis do fluxo.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )

      default:
        return <p className="text-muted-foreground text-sm">Selecione um node para editar</p>
    }
  }

  const getNodeTitle = () => {
    const titles: Record<string, string> = {
      START: 'Inicio',
      MESSAGE: 'Mensagem',
      IMAGE: 'Imagem',
      AUDIO: 'Audio',
      VIDEO: 'Video',
      DOCUMENT: 'Documento',
      MENU: 'Menu',
      BUTTONS: 'Botoes',
      LIST: 'Lista/Menu',
      CONDITION: 'Condicao',
      DELAY: 'Aguardar',
      SET_VARIABLE: 'Variavel',
      HTTP_REQUEST: 'HTTP Request',
      TRANSFER: 'Transferir',
      GO_TO_FLOW: 'Ir para Fluxo',
      END: 'Fim',
    }
    return titles[nodeType] || nodeType
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-background border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-lg">{getNodeTitle()}</h3>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1">{renderFields()}</div>
        </div>
      </div>
    </>
  )
}
