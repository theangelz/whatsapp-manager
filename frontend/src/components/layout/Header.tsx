import { Moon, Sun, Bell, User, Download, Loader2 } from 'lucide-react'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore } from '@/stores/theme.store'
import api from '@/services/api'

export function Header() {
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()

  const isAdmin = user?.email === 'admin@whatsapp' || user?.email === 'admin@whatsapp.local'

  // Check for updates automatically (admin only)
  const { data: updateInfo } = useQuery({
    queryKey: ['check-update-header'],
    queryFn: async () => {
      const response = await api.get('/admin/check-update')
      return response.data
    },
    enabled: isAdmin,
    refetchInterval: 86400000, // Check once per day (24h)
    staleTime: 3600000, // Consider fresh for 1 hour
    retry: false,
  })

  // Execute update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/admin/execute-update')
      return response.data
    },
    onSuccess: () => {
      setTimeout(() => window.location.reload(), 3000)
    },
  })

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light')
    } else {
      setTheme('dark')
    }
  }

  return (
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
            onClick={() => updateMutation.mutate()}
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
  )
}
