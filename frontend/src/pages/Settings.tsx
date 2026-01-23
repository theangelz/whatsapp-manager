import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Building2,
  User,
  Key,
  Bell,
  Palette,
  Moon,
  Sun,
  Monitor,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore } from '@/stores/theme.store'
import api from '@/services/api'

export function Settings() {
  const { user, company } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)

  const isAdmin = user?.email === 'admin@whatsapp' || user?.email === 'admin@whatsapp.local'

  const { data: companyData } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const response = await api.get('/companies/current')
      return response.data
    },
  })

  // Check for updates (admin only)
  const { data: updateInfo, refetch: checkUpdates, isLoading: checkingUpdate } = useQuery({
    queryKey: ['check-update'],
    queryFn: async () => {
      const response = await api.get('/admin/check-update')
      return response.data
    },
    enabled: isAdmin,
    refetchInterval: 86400000, // Check once per day
  })

  // Execute update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/admin/execute-update')
      return response.data
    },
    onSuccess: (data) => {
      setUpdateStatus(data.message)
      setTimeout(() => window.location.reload(), 3000)
    },
    onError: (error: any) => {
      setUpdateStatus(`Erro: ${error.response?.data?.details || error.message}`)
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configurações</h2>
        <p className="text-muted-foreground">
          Gerencie as configurações do sistema
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Perfil
            </CardTitle>
            <CardDescription>Suas informações de usuário</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={user?.name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Função</Label>
              <Input
                value={user?.role === 'ADMIN' ? 'Administrador' : 'Operador'}
                disabled
              />
            </div>
          </CardContent>
        </Card>

        {/* Company */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Empresa
            </CardTitle>
            <CardDescription>Informações da empresa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input value={company?.name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Input value={company?.plan || 'Free'} disabled />
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <p className="text-2xl font-bold">
                  {companyData?._count?.instances || 0}
                </p>
                <p className="text-sm text-muted-foreground">Instâncias</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {companyData?._count?.contacts || 0}
                </p>
                <p className="text-sm text-muted-foreground">Contatos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Aparência
            </CardTitle>
            <CardDescription>Personalize a interface</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4" />
                  <span>Claro</span>
                </div>
                <Button
                  variant={theme === 'light' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme('light')}
                >
                  {theme === 'light' && 'Ativo'}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4" />
                  <span>Escuro</span>
                </div>
                <Button
                  variant={theme === 'dark' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme('dark')}
                >
                  {theme === 'dark' && 'Ativo'}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  <span>Sistema</span>
                </div>
                <Button
                  variant={theme === 'system' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme('system')}
                >
                  {theme === 'system' && 'Ativo'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificações
            </CardTitle>
            <CardDescription>Configure alertas e notificações</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Mensagens recebidas</p>
                <p className="text-sm text-muted-foreground">
                  Receba notificações de novas mensagens
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Falhas de envio</p>
                <p className="text-sm text-muted-foreground">
                  Alertas quando mensagens falharem
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Instância desconectada</p>
                <p className="text-sm text-muted-foreground">
                  Avisar quando uma instância desconectar
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* System Update - Admin Only */}
        {isAdmin && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Sistema
              </CardTitle>
              <CardDescription>Versão e atualizações do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Versão Atual</p>
                  <p className="text-2xl font-bold text-green-500">
                    v{updateInfo?.currentVersion || '...'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkUpdates()}
                  disabled={checkingUpdate}
                >
                  {checkingUpdate ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Verificar
                </Button>
              </div>

              {updateInfo?.hasUpdate && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 text-yellow-500">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-semibold">Nova versão disponível!</span>
                  </div>
                  <p className="text-sm">
                    <strong>Versão {updateInfo.latestVersion}</strong> lançada em{' '}
                    {new Date(updateInfo.publishedAt).toLocaleDateString('pt-BR')}
                  </p>
                  <Button
                    variant="whatsapp"
                    onClick={() => updateMutation.mutate()}
                    disabled={updateMutation.isPending}
                    className="w-full"
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Atualizando...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Atualizar Sistema
                      </>
                    )}
                  </Button>
                </div>
              )}

              {!updateInfo?.hasUpdate && updateInfo && (
                <div className="p-4 bg-green-500/10 border border-green-500 rounded-lg flex items-center gap-2 text-green-500">
                  <CheckCircle className="h-5 w-5" />
                  <span>Sistema atualizado!</span>
                </div>
              )}

              {updateStatus && (
                <div className="p-3 bg-muted rounded-lg text-sm">
                  {updateStatus}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
