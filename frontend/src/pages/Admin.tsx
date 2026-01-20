import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Users,
  Smartphone,
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Loader2,
  Key,
  Crown,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import api from '@/services/api'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Company {
  id: string
  name: string
  plan: string
  maxInstances: number
  isActive: boolean
  createdAt: string
  users: { id: string; name: string; email: string }[]
  _count: {
    instances: number
    contacts: number
    messages: number
  }
}

interface AdminStats {
  companies: { total: number; active: number }
  users: number
  instances: { total: number; connected: number }
  messages: { total: number; today: number }
}

const planLabels: Record<string, string> = {
  FREE: 'Gratuito',
  BASIC: 'Basico',
  PRO: 'Profissional',
  ENTERPRISE: 'Empresarial',
}

const planColors: Record<string, string> = {
  FREE: 'secondary',
  BASIC: 'default',
  PRO: 'default',
  ENTERPRISE: 'default',
}

export function Admin() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; email: string } | null>(null)

  const [newCompany, setNewCompany] = useState({
    companyName: '',
    userName: '',
    email: '',
    password: '',
    plan: 'FREE',
    maxInstances: 1,
  })

  const [editData, setEditData] = useState({
    name: '',
    plan: 'FREE',
    maxInstances: 1,
  })

  const [newPassword, setNewPassword] = useState('')

  const { data: stats } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const response = await api.get('/admin/stats')
      return response.data
    },
  })

  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const response = await api.get('/admin/companies')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof newCompany) => {
      const response = await api.post('/admin/companies', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      setCreateDialogOpen(false)
      setNewCompany({
        companyName: '',
        userName: '',
        email: '',
        password: '',
        plan: 'FREE',
        maxInstances: 1,
      })
    },
  })

  const updateCompanyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await api.put(`/admin/companies/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] })
      setEditDialogOpen(false)
      setSelectedCompany(null)
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await api.put(`/admin/companies/${id}`, { isActive })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })

  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/companies/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      setDeleteDialogOpen(false)
      setSelectedCompany(null)
    },
  })

  const updatePasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const response = await api.put(`/admin/users/${userId}`, { password })
      return response.data
    },
    onSuccess: () => {
      setPasswordDialogOpen(false)
      setSelectedUser(null)
      setNewPassword('')
    },
  })

  const filteredCompanies = Array.isArray(companies)
    ? companies.filter(
        (company) =>
          company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          company.users.some((u) => u.email.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : []

  const openEditDialog = (company: Company) => {
    setSelectedCompany(company)
    setEditData({
      name: company.name,
      plan: company.plan,
      maxInstances: company.maxInstances,
    })
    setEditDialogOpen(true)
  }

  const openPasswordDialog = (user: { id: string; name: string; email: string }) => {
    setSelectedUser(user)
    setPasswordDialogOpen(true)
  }

  const openDeleteDialog = (company: Company) => {
    setSelectedCompany(company)
    setDeleteDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Crown className="h-7 w-7 text-yellow-500" />
            Painel Administrativo
          </h2>
          <p className="text-muted-foreground">
            Gerencie empresas, usuarios e planos
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Empresa
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Empresas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.companies.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.companies.active || 0} ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuarios</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.users || 0}</div>
            <p className="text-xs text-muted-foreground">cadastrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instancias</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.instances.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.instances.connected || 0} conectadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens Hoje</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.messages.today || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.messages.total || 0} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por empresa ou email..."
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Companies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Empresas Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Instancias</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell>
                        {company.users[0] && (
                          <div>
                            <p className="text-sm">{company.users[0].name}</p>
                            <p className="text-xs text-muted-foreground">{company.users[0].email}</p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={planColors[company.plan] as any}>
                          {planLabels[company.plan]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {company._count.instances} / {company.maxInstances}
                      </TableCell>
                      <TableCell>
                        <Badge variant={company.isActive ? 'default' : 'secondary'}>
                          {company.isActive ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(company.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(company)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {company.users[0] && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openPasswordDialog(company.users[0])}
                              title="Alterar Senha"
                            >
                              <Key className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleStatusMutation.mutate({ id: company.id, isActive: !company.isActive })}
                            title={company.isActive ? 'Desativar' : 'Ativar'}
                          >
                            {company.isActive ? (
                              <PowerOff className="h-4 w-4 text-red-500" />
                            ) : (
                              <Power className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(company)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredCompanies.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhuma empresa encontrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Company Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome da Empresa</Label>
                <Input
                  value={newCompany.companyName}
                  onChange={(e) => setNewCompany({ ...newCompany, companyName: e.target.value })}
                  placeholder="Minha Empresa"
                />
              </div>
              <div className="space-y-2">
                <Label>Nome do Usuario</Label>
                <Input
                  value={newCompany.userName}
                  onChange={(e) => setNewCompany({ ...newCompany, userName: e.target.value })}
                  placeholder="Joao Silva"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newCompany.email}
                  onChange={(e) => setNewCompany({ ...newCompany, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={newCompany.password}
                  onChange={(e) => setNewCompany({ ...newCompany, password: e.target.value })}
                  placeholder="******"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select
                  value={newCompany.plan}
                  onValueChange={(v) => setNewCompany({ ...newCompany, plan: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FREE">Gratuito</SelectItem>
                    <SelectItem value="BASIC">Basico</SelectItem>
                    <SelectItem value="PRO">Profissional</SelectItem>
                    <SelectItem value="ENTERPRISE">Empresarial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max. Instancias</Label>
                <Input
                  type="number"
                  min={1}
                  value={newCompany.maxInstances}
                  onChange={(e) => setNewCompany({ ...newCompany, maxInstances: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate(newCompany)}
              disabled={!newCompany.companyName || !newCompany.email || !newCompany.password || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select
                  value={editData.plan}
                  onValueChange={(v) => setEditData({ ...editData, plan: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FREE">Gratuito</SelectItem>
                    <SelectItem value="BASIC">Basico</SelectItem>
                    <SelectItem value="PRO">Profissional</SelectItem>
                    <SelectItem value="ENTERPRISE">Empresarial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max. Instancias</Label>
                <Input
                  type="number"
                  min={1}
                  value={editData.maxInstances}
                  onChange={(e) => setEditData({ ...editData, maxInstances: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => selectedCompany && updateCompanyMutation.mutate({ id: selectedCompany.id, data: editData })}
              disabled={updateCompanyMutation.isPending}
            >
              {updateCompanyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Alterando senha de: <strong>{selectedUser?.email}</strong>
            </p>
            <div className="space-y-2">
              <Label>Nova Senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="******"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => selectedUser && updatePasswordMutation.mutate({ userId: selectedUser.id, password: newPassword })}
              disabled={!newPassword || newPassword.length < 6 || updatePasswordMutation.isPending}
            >
              {updatePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Alterar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a empresa <strong>{selectedCompany?.name}</strong>?
              <br /><br />
              Esta acao ira excluir permanentemente todos os dados relacionados:
              <ul className="list-disc list-inside mt-2">
                <li>Instancias e conexoes</li>
                <li>Mensagens e contatos</li>
                <li>Campanhas e templates</li>
                <li>Usuarios da empresa</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => selectedCompany && deleteCompanyMutation.mutate(selectedCompany.id)}
            >
              {deleteCompanyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
