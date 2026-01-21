import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Users,
  UsersRound,
  Send,
  FileText,
  Bot,
  Webhook,
  Settings,
  LogOut,
  Code,
  Workflow,
  X,
  Crown,
  Globe,
  Zap,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/instances', label: 'Instancias', icon: Smartphone },
  { path: '/groups', label: 'Grupos', icon: UsersRound },
  { path: '/flows', label: 'Fluxos', icon: Workflow },
  { path: '/messages', label: 'Mensagens', icon: MessageSquare },
  { path: '/contacts', label: 'Contatos', icon: Users },
  { path: '/campaigns', label: 'Campanhas', icon: Send },
  { path: '/templates', label: 'Templates Meta', icon: FileText },
  { path: '/webhook-events', label: 'Webhook Entrada', icon: Globe },
  { path: '/automations', label: 'Automacoes', icon: Zap },
  { path: '/typebot', label: 'Typebot', icon: Bot },
  { path: '/webhooks', label: 'Webhooks', icon: Webhook },
  { path: '/api-docs', label: 'API Docs', icon: Code },
  { path: '/settings', label: 'Configuracoes', icon: Settings },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation()
  const { company, user, logout } = useAuthStore()

  const isAdmin = user?.email === 'admin@whatsapp' || user?.email === 'admin@whatsapp.local'

  const handleLogout = () => {
    logout()
    onClose?.()
  }

  const handleLinkClick = () => {
    onClose?.()
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 h-screen w-64 border-r bg-card transition-transform duration-300',
        // Mobile: hidden by default, shown when open
        'lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-whatsapp text-white">
              <MessageSquare className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg">WA Manager</span>
          </div>
          {/* Close button for mobile */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Company */}
        <div className="border-b px-4 py-3">
          <p className="text-xs text-muted-foreground">Empresa</p>
          <p className="font-medium truncate">{company?.name || 'Carregando...'}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleLinkClick}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}

          {/* Admin Menu - only for admin@whatsapp */}
          {isAdmin && (
            <>
              <div className="my-2 border-t" />
              <Link
                to="/admin"
                onClick={handleLinkClick}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  location.pathname === '/admin'
                    ? 'bg-yellow-500 text-white'
                    : 'text-yellow-600 hover:bg-yellow-100 dark:hover:bg-yellow-900'
                )}
              >
                <Crown className="h-4 w-4" />
                Administracao
              </Link>
            </>
          )}
        </nav>

        {/* Logout */}
        <div className="border-t p-4">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </aside>
  )
}
