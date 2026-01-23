import { useState, useRef } from 'react'
import { Moon, Sun, Bell, User, Download, Loader2, CheckCircle, XCircle, GitBranch, Package, Hammer, RotateCcw, Code } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
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
import { Progress } from '@/components/ui/progress'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore } from '@/stores/theme.store'
import api from '@/services/api'

type UpdateStep = 'idle' | 'git' | 'backend' | 'build-backend' | 'frontend' | 'restart' | 'complete' | 'error'

interface StepInfo {
  label: string
  icon: React.ReactNode
}

const stepConfig: Record<UpdateStep, StepInfo> = {
  idle: { label: 'Preparando...', icon: <Loader2 className="h-5 w-5 animate-spin" /> },
  git: { label: 'Baixando atualizações (git pull)', icon: <GitBranch className="h-5 w-5" /> },
  backend: { label: 'Instalando dependências do backend', icon: <Package className="h-5 w-5" /> },
  'build-backend': { label: 'Compilando backend', icon: <Code className="h-5 w-5" /> },
  frontend: { label: 'Compilando frontend', icon: <Hammer className="h-5 w-5" /> },
  restart: { label: 'Reiniciando serviços', icon: <RotateCcw className="h-5 w-5" /> },
  complete: { label: 'Atualização concluída!', icon: <CheckCircle className="h-5 w-5 text-green-500" /> },
  error: { label: 'Erro na atualização', icon: <XCircle className="h-5 w-5 text-red-500" /> },
}

const stepOrder: UpdateStep[] = ['git', 'backend', 'build-backend', 'frontend', 'restart']

export function Header() {
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [currentStep, setCurrentStep] = useState<UpdateStep>('idle')
  const [completedSteps, setCompletedSteps] = useState<Set<UpdateStep>>(new Set())
  const [errorMessage, setErrorMessage] = useState('')
  const [stepDetails, setStepDetails] = useState<string>('')
  const [isUpdating, setIsUpdating] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

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

  const handleUpdate = () => {
    setShowUpdateModal(true)
    setCurrentStep('idle')
    setCompletedSteps(new Set())
    setErrorMessage('')
    setStepDetails('')
    setIsUpdating(true)

    // Get the base URL from the API config
    const baseUrl = api.defaults.baseURL || ''
    const token = localStorage.getItem('token')

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    // Create EventSource for SSE
    const eventSource = new EventSource(`${baseUrl}/admin/execute-update-stream?token=${token}`)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const { step, status, message, details } = data

        if (status === 'running') {
          setCurrentStep(step as UpdateStep)
          setStepDetails(message)
        } else if (status === 'done') {
          if (step === 'complete') {
            setCurrentStep('complete')
            setIsUpdating(false)
            eventSource.close()
            // Reload after success
            setTimeout(() => {
              window.location.reload()
            }, 2000)
          } else {
            setCompletedSteps(prev => new Set([...prev, step as UpdateStep]))
            if (details) setStepDetails(details)
          }
        } else if (status === 'error') {
          setCurrentStep('error')
          setErrorMessage(details || message)
          setIsUpdating(false)
          eventSource.close()
        }
      } catch (e) {
        console.error('Error parsing SSE data:', e)
      }
    }

    eventSource.onerror = () => {
      if (currentStep !== 'complete' && currentStep !== 'error') {
        setCurrentStep('error')
        setErrorMessage('Conexão perdida com o servidor. Verifique se a atualização foi concluída.')
        setIsUpdating(false)
      }
      eventSource.close()
    }
  }

  const handleCloseModal = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    setShowUpdateModal(false)
    setIsUpdating(false)
  }

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light')
    } else {
      setTheme('dark')
    }
  }

  // Calculate progress percentage
  const getProgressPercentage = () => {
    if (currentStep === 'complete') return 100
    if (currentStep === 'error') return 0
    const completedCount = completedSteps.size
    const currentIndex = stepOrder.indexOf(currentStep)
    const totalSteps = stepOrder.length
    if (currentIndex >= 0) {
      return Math.round(((completedCount + 0.5) / totalSteps) * 100)
    }
    return Math.round((completedCount / totalSteps) * 100)
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
              disabled={isUpdating}
              title={`Atualizar para v${updateInfo.latestVersion}`}
            >
              {isUpdating ? (
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
      <Dialog open={showUpdateModal} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-lg">
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
            {/* Progress Bar */}
            {currentStep !== 'idle' && currentStep !== 'error' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-medium">{getProgressPercentage()}%</span>
                </div>
                <Progress value={getProgressPercentage()} className="h-2" />
              </div>
            )}

            {/* Progress Steps */}
            <div className="space-y-2">
              {stepOrder.map((step) => {
                const config = stepConfig[step]
                const isActive = currentStep === step
                const isCompleted = completedSteps.has(step)
                const currentIndex = stepOrder.indexOf(currentStep)
                const stepIndex = stepOrder.indexOf(step)
                const isErrored = currentStep === 'error' && stepIndex >= currentIndex

                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      isActive ? 'bg-primary/10 border border-primary' :
                      isCompleted ? 'bg-green-500/10 border border-green-500/50' :
                      isErrored ? 'bg-red-500/10 border border-red-500/50' :
                      'bg-muted/30 border border-transparent'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {isActive && !isCompleted ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      ) : isCompleted ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : isErrored ? (
                        <XCircle className="h-5 w-5 text-red-500" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                      )}
                    </div>
                    <div className="flex-grow min-w-0">
                      <span className={`text-sm ${isActive ? 'font-medium text-primary' : isCompleted ? 'text-green-600' : ''}`}>
                        {config.label}
                      </span>
                      {isActive && stepDetails && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{stepDetails}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-muted-foreground">
                      {config.icon}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Success Message */}
            {currentStep === 'complete' && (
              <div className="p-4 bg-green-500/10 border border-green-500 rounded-lg text-center animate-in fade-in duration-300">
                <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
                <p className="font-medium text-green-600">Atualização concluída com sucesso!</p>
                <p className="text-sm text-muted-foreground mt-1">Recarregando página em instantes...</p>
              </div>
            )}

            {/* Error Message */}
            {currentStep === 'error' && (
              <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg animate-in fade-in duration-300">
                <div className="flex items-center gap-2 text-red-500 mb-2">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Erro na atualização</span>
                </div>
                <p className="text-sm text-muted-foreground break-words">{errorMessage}</p>
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCloseModal}
                  >
                    Fechar
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleUpdate}
                  >
                    Tentar novamente
                  </Button>
                </div>
              </div>
            )}

            {/* Manual Instructions Footer */}
            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2 text-center">
                Se a atualização automática falhar, execute na VPS:
              </p>
              <code className="text-xs bg-muted px-3 py-2 rounded block font-mono break-all">
                cd /root/whatsapp-manager && git pull && cd backend && npm i && npm run build && pm2 restart all
              </code>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
