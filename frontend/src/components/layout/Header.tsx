import { useState } from 'react'
import { Moon, Sun, Bell, User, Download, Loader2, CheckCircle, XCircle, GitBranch, Package, Hammer, RotateCcw } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore } from '@/stores/theme.store'
import api from '@/services/api'

type UpdateStep = 'idle' | 'git' | 'backend' | 'frontend' | 'restart' | 'done' | 'error'

const stepLabels: Record<UpdateStep, string> = {
  idle: 'Preparando...',
  git: 'Baixando atualizações (git pull)...',
  backend: 'Instalando dependências do backend...',
  frontend: 'Compilando frontend...',
  restart: 'Reiniciando serviços...',
  done: 'Atualização concluída!',
  error: 'Erro na atualização',
}

export function Header() {
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [currentStep, setCurrentStep] = useState<UpdateStep>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const isAdmin = user?.email === 'admin@whatsapp' || user?.email === 'admin@whatsapp.local'

  // Check for updates automatically (admin only)
  const { data: updateInfo } = useQuery({
    queryKey: ['check-update-header'],
    queryFn: async () => {
      const response = await api.get('/admin/check-update')
      return response.data
    },
    enabled: isAdmin,
    refetchInterval: 86400000,
    staleTime: 3600000,
    retry: false,
  })

  // Execute update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      setCurrentStep('git')
      const response = await api.post('/admin/execute-update')
      return response.data
    },
    onSuccess: () => {
      setCurrentStep('done')
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    },
    onError: (error: any) => {
      setCurrentStep('error')
      setErrorMessage(error.response?.data?.details || error.message || 'Erro desconhecido')
    },
  })

  const handleUpdate = () => {
    setShowUpdateModal(true)
    setCurrentStep('idle')
    setErrorMessage('')

    // Simulate step progression for better UX
    setTimeout(() => setCurrentStep('git'), 500)
    setTimeout(() => {
      if (currentStep !== 'error') setCurrentStep('backend')
    }, 3000)
    setTimeout(() => {
      if (currentStep !== 'error') setCurrentStep('frontend')
    }, 8000)
    setTimeout(() => {
      if (currentStep !== 'error') setCurrentStep('restart')
    }, 15000)

    updateMutation.mutate()
  }

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light')
    } else {
      setTheme('dark')
    }
  }

  const getStepIcon = (step: UpdateStep) => {
    switch (step) {
      case 'git':
        return <GitBranch className="h-5 w-5" />
      case 'backend':
        return <Package className="h-5 w-5" />
      case 'frontend':
        return <Hammer className="h-5 w-5" />
      case 'restart':
        return <RotateCcw className="h-5 w-5" />
      case 'done':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <Loader2 className="h-5 w-5 animate-spin" />
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card px-6">
        <div>
          <h1 className="text-lg font-semibold">WhatsApp Manager</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Theme Toggle */}
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          {/* Update Available (Admin Only) */}
          {isAdmin && updateInfo?.hasUpdate && (
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              title={`Atualizar para v${updateInfo.latestVersion}`}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Download className="h-5 w-5 text-green-500" />
                  <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-green-500">
                    !
                  </Badge>
                </>
              )}
            </Button>
          )}

          {/* Version Badge (Admin Only) */}
          {isAdmin && updateInfo && !updateInfo.hasUpdate && (
            <Badge variant="outline" className="text-xs">
              v{updateInfo.currentVersion}
            </Badge>
          )}

          {/* Notifications */}
          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar>
                  <AvatarFallback>
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Update Modal */}
      <Dialog open={showUpdateModal} onOpenChange={setShowUpdateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Atualizando Sistema
            </DialogTitle>
            <DialogDescription>
              {updateInfo?.hasUpdate && `Atualizando de v${updateInfo.currentVersion} para v${updateInfo.latestVersion}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Progress Steps */}
            <div className="space-y-3">
              {(['git', 'backend', 'frontend', 'restart'] as UpdateStep[]).map((step, index) => {
                const steps: UpdateStep[] = ['git', 'backend', 'frontend', 'restart']
                const currentIndex = steps.indexOf(currentStep)
                const stepIndex = index
                const isActive = currentStep === step
                const isCompleted = currentIndex > stepIndex || currentStep === 'done'
                const isPending = currentIndex < stepIndex && currentStep !== 'error'

                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      isActive ? 'bg-primary/10 border border-primary' :
                      isCompleted ? 'bg-green-500/10 border border-green-500' :
                      currentStep === 'error' && stepIndex >= currentIndex ? 'bg-red-500/10 border border-red-500' :
                      'bg-muted/50 border border-transparent'
                    }`}
                  >
                    {isActive && currentStep !== 'done' && currentStep !== 'error' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : isCompleted ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : currentStep === 'error' && stepIndex >= currentIndex ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    <span className={`text-sm ${isActive ? 'font-medium' : ''}`}>
                      {stepLabels[step]}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Success Message */}
            {currentStep === 'done' && (
              <div className="p-4 bg-green-500/10 border border-green-500 rounded-lg text-center">
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="font-medium text-green-500">Atualização concluída!</p>
                <p className="text-sm text-muted-foreground">Recarregando página...</p>
              </div>
            )}

            {/* Error Message */}
            {currentStep === 'error' && (
              <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg">
                <div className="flex items-center gap-2 text-red-500 mb-2">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Erro na atualização</span>
                </div>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowUpdateModal(false)}
                >
                  Fechar
                </Button>
              </div>
            )}

            {/* Manual Instructions Footer */}
            <div className="pt-4 border-t text-center">
              <p className="text-xs text-muted-foreground mb-2">
                Se a atualização automática falhar, execute na VPS:
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded block">
                cd /root/whatsapp-manager && git pull && cd backend && npm i && npm run build && pm2 restart all
              </code>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
