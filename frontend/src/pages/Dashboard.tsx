import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, lazy, Suspense } from 'react'
import {
  Smartphone,
  MessageSquare,
  Users,
  Send,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  BarChart3,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import api from '@/services/api'
import type { DashboardStats, Instance } from '@/types'

const mockChartData = [
  { name: 'Seg', enviadas: 120, recebidas: 80 },
  { name: 'Ter', enviadas: 150, recebidas: 100 },
  { name: 'Qua', enviadas: 180, recebidas: 120 },
  { name: 'Qui', enviadas: 140, recebidas: 90 },
  { name: 'Sex', enviadas: 200, recebidas: 150 },
  { name: 'Sab', enviadas: 80, recebidas: 60 },
  { name: 'Dom', enviadas: 60, recebidas: 40 },
]

// Lazy load recharts to prevent crashes on mobile
function ChartFallback() {
  return (
    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Carregando grafico...</p>
      </div>
    </div>
  )
}

function SimpleChart({ data }: { data: typeof mockChartData }) {
  const [RechartsComponents, setRechartsComponents] = useState<any>(null)
  const [chartError, setChartError] = useState(false)

  useEffect(() => {
    import('recharts')
      .then((module) => {
        setRechartsComponents({
          LineChart: module.LineChart,
          Line: module.Line,
          XAxis: module.XAxis,
          YAxis: module.YAxis,
          CartesianGrid: module.CartesianGrid,
          Tooltip: module.Tooltip,
          ResponsiveContainer: module.ResponsiveContainer,
        })
      })
      .catch((err) => {
        console.error('Failed to load recharts:', err)
        setChartError(true)
      })
  }, [])

  if (chartError) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
          <p className="text-sm">Grafico indisponivel</p>
        </div>
      </div>
    )
  }

  if (!RechartsComponents) {
    return <ChartFallback />
  }

  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = RechartsComponents

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" className="text-xs" />
          <YAxis className="text-xs" />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="enviadas"
            stroke="#25D366"
            strokeWidth={2}
            name="Enviadas"
          />
          <Line
            type="monotone"
            dataKey="recebidas"
            stroke="#128C7E"
            strokeWidth={2}
            name="Recebidas"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Dashboard() {
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/companies/stats')
      return response.data
    },
  })

  const { data: instances } = useQuery<Instance[]>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await api.get('/instances')
      return response.data
    },
  })

  const statCards = [
    {
      title: 'Instancias',
      value: stats?.instances?.total || 0,
      description: `${stats?.instances?.online || 0} online`,
      icon: Smartphone,
      trend: 'up',
    },
    {
      title: 'Mensagens Hoje',
      value: stats?.messages?.today || 0,
      description: `${stats?.messages?.total || 0} total`,
      icon: MessageSquare,
      trend: 'up',
    },
    {
      title: 'Contatos',
      value: stats?.contacts || 0,
      description: 'Cadastrados',
      icon: Users,
      trend: 'up',
    },
    {
      title: 'Campanhas',
      value: stats?.campaigns || 0,
      description: 'Criadas',
      icon: Send,
      trend: 'neutral',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground text-sm md:text-base">
          Visao geral das suas instancias e metricas
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs md:text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {stat.trend === 'up' && (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  )}
                  {stat.trend === 'down' && (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Activity className="h-5 w-5" />
              Mensagens por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleChart data={mockChartData} />
          </CardContent>
        </Card>

        {/* Recent Instances */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Smartphone className="h-5 w-5" />
              Instancias Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.isArray(instances) && instances.slice(0, 5).map((instance) => (
                <div
                  key={instance.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-muted flex items-center justify-center">
                      {instance.profilePicture ? (
                        <img
                          src={instance.profilePicture}
                          alt={instance.name}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <Smartphone className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{instance.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {instance.phoneNumber || 'Nao conectado'}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      instance.status === 'CONNECTED'
                        ? 'success'
                        : instance.status === 'CONNECTING'
                        ? 'warning'
                        : 'secondary'
                    }
                    className="flex-shrink-0 ml-2"
                  >
                    {instance.status === 'CONNECTED'
                      ? 'Online'
                      : instance.status === 'CONNECTING'
                      ? 'Conectando'
                      : 'Offline'}
                  </Badge>
                </div>
              ))}

              {(!instances || instances.length === 0) && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma instancia criada
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
