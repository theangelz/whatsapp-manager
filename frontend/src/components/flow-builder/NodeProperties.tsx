import { useState, useEffect } from 'react'
import { Node } from 'reactflow'
import { X, Plus, Trash2 } from 'lucide-react'
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
import type { FlowNodeData, FlowNodeType } from '@/types'

interface NodePropertiesProps {
  node: Node<FlowNodeData> | null
  onUpdate: (nodeId: string, data: FlowNodeData) => void
  onClose: () => void
}

export function NodeProperties({ node, onUpdate, onClose }: NodePropertiesProps) {
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
              <Label>Mensagem</Label>
              <Textarea
                value={data.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Digite a mensagem..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{variavel}}'} para inserir variaveis
              </p>
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
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Variavel</Label>
              <Input
                value={data.condition?.variable || ''}
                onChange={(e) =>
                  handleChange('condition', { ...data.condition, variable: e.target.value })
                }
                placeholder="_lastInput"
              />
            </div>
            <div className="space-y-2">
              <Label>Operador</Label>
              <Select
                value={data.condition?.operator || 'equals'}
                onValueChange={(value) =>
                  handleChange('condition', { ...data.condition, operator: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Igual a</SelectItem>
                  <SelectItem value="contains">Contem</SelectItem>
                  <SelectItem value="startsWith">Comeca com</SelectItem>
                  <SelectItem value="endsWith">Termina com</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                  <SelectItem value="exists">Existe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                value={data.condition?.value || ''}
                onChange={(e) =>
                  handleChange('condition', { ...data.condition, value: e.target.value })
                }
                placeholder="valor esperado"
              />
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
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={data.httpConfig?.url || ''}
                onChange={(e) =>
                  handleChange('httpConfig', { ...data.httpConfig, url: e.target.value })
                }
                placeholder="https://api.exemplo.com/endpoint"
              />
            </div>
            <div className="space-y-2">
              <Label>Body (JSON)</Label>
              <Textarea
                value={data.httpConfig?.body || ''}
                onChange={(e) =>
                  handleChange('httpConfig', { ...data.httpConfig, body: e.target.value })
                }
                placeholder='{"chave": "{{variavel}}"}'
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Salvar resposta em</Label>
              <Input
                value={data.httpConfig?.responseVariable || ''}
                onChange={(e) =>
                  handleChange('httpConfig', { ...data.httpConfig, responseVariable: e.target.value })
                }
                placeholder="resposta_api"
              />
            </div>
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
    <div className="w-80 bg-muted/30 border-l overflow-y-auto">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold">{getNodeTitle()}</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-4">{renderFields()}</div>
    </div>
  )
}
