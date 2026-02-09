import { useState, useEffect } from "react"
import axios from "axios"
import { BrowserRouter, Routes, Route, useNavigate, useParams, Link } from "react-router-dom"
import { QRCodeCanvas } from "qrcode.react"
import {
  Dashboard as DashboardIcon,
  Send as SendIcon,
  RequestPage as RequestIcon,
  AccountBalanceWallet as WalletIcon,
  History as HistoryIcon,
  QrCode as QrIcon,
  Link as LinkIcon,
  CheckCircle,
  ContentCopy,
  Logout as LogoutIcon,
  Notifications as NotificationsIcon
} from "@mui/icons-material"
import {
  Box,
  Typography,
  Button,
  TextField,
  Card,
  CardContent,
  Alert,
  Avatar,
  Grid,
  Paper,
  InputAdornment,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  AppBar,
  Toolbar,
  IconButton,
  Badge,
  Container,
  Fade,
  Slide
} from "@mui/material"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import CssBaseline from "@mui/material/CssBaseline"
import { format } from "date-fns"
import { es } from "date-fns/locale"

const API_URL = (import.meta as any).env?.VITE_PAYMENT_URL || "http://localhost:3005"
const AUTH_URL = (import.meta as any).env?.VITE_AUTH_URL || "http://localhost:3008"
const CURRENCY = "PYG"

const theme = createTheme({
  palette: {
    primary: { main: '#0070BA', dark: '#005ea6', light: '#E6F3FF' },
    secondary: { main: '#6c757d' },
    success: { main: '#2E8B57', light: '#E8F5E9' },
    error: { main: '#DC143C', light: '#FFEBEE' },
    background: { default: '#f5f7fa', paper: '#ffffff' },
  },
  typography: { 
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 20, textTransform: 'none', fontWeight: 600 }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }
      }
    }
  }
})

interface Payment {
  id: string
  type: string
  state: string
  amount: { amount: number; currency: string }
  senderId: string
  receiverId: string
  description: string
  createdAt: string
  completedAt?: string
}

interface PaymentLink {
  id: string
  merchantId: string
  amount: number
  currency: string
  description: string
  url: string
  isActive: boolean
  currentUses: number
  createdAt: string
}

interface WalletBalance {
  available: number
  held: number
  pending: number
  total: number
}

interface Transaction {
  id: string
  type: string
  amount: number
  currency: string
  description: string
  created_at: string
}

const formatMoney = (amount: number) => {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-"
  try {
    return format(new Date(dateStr), "dd MMM yyyy, HH:mm", { locale: es })
  } catch { return dateStr }
}

function Navigation({ currentUser, balance }: { currentUser: string; balance: number }) {
  const navigate = useNavigate()

  const navItems = [
    { path: "/", icon: <DashboardIcon />, label: "Inicio" },
    { path: "/send", icon: <SendIcon />, label: "Enviar" },
    { path: "/request", icon: <RequestIcon />, label: "Solicitar" },
    { path: "/collect", icon: <LinkIcon />, label: "Cobrar" },
    { path: "/wallet", icon: <WalletIcon />, label: "Cartera" },
    { path: "/activity", icon: <HistoryIcon />, label: "Actividad" },
    { path: "/qr", icon: <QrIcon />, label: "QR" },
    { path: "/profile", icon: <Avatar sx={{ width: 24, height: 24 }} />, label: "Perfil" },
  ]

  return (
    <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: "white", mb: 3 }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters>
          <Typography variant="h5" sx={{ color: "primary.main", fontWeight: 700, cursor: "pointer", mr: 4, display: 'flex', alignItems: 'center' }} onClick={() => navigate("/")}>
            💰 PayFlow
          </Typography>
          
          <Box sx={{ display: { xs: "none", md: "flex" }, gap: 0.5, flexGrow: 1 }}>
            {navItems.map((item) => (
              <Button key={item.path} component={Link} to={item.path} startIcon={item.icon} 
                aria-label={item.label}
                sx={{ color: "text.primary", px: 2, py: 1 }}>
                {item.label}
              </Button>
            ))}
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <IconButton color="primary" aria-label="Notificaciones">
              <Badge badgeContent={0} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
            <Chip 
              label={formatMoney(balance)} 
              color="primary" 
              sx={{ fontWeight: 600, fontSize: "0.9rem", px: 1 }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
              <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36 }}>
                {currentUser.slice(0, 2).toUpperCase()}
              </Avatar>
              <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                {localStorage.getItem('email') || currentUser}
              </Typography>
              <IconButton aria-label="Salir" onClick={() => { localStorage.setItem('currentUser',''); localStorage.setItem('permissions','[]'); window.location.href = '/login'; }}>
                <LogoutIcon />
              </IconButton>
            </Box>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  )
}

function Dashboard({ currentUser }: { currentUser: string }) {
  const navigate = useNavigate()
  const [balance, setBalance] = useState(0)
  const [recentActivity, setRecentActivity] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [currentUser])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [balanceRes, activityRes] = await Promise.all([
        axios.get(`${API_URL}/api/v1/wallets/${currentUser}/balance?currency=${CURRENCY}`),
        axios.get(`${API_URL}/api/v1/payments?userId=${currentUser}`)
      ])
      if (balanceRes.data.success) setBalance(balanceRes.data.data.available)
      if (activityRes.data.success) setRecentActivity(activityRes.data.data.slice(0, 5))
    } catch (error) { console.error("Error fetching dashboard:", error) }
    finally { setLoading(false) }
  }

  const quickActions = [
    { icon: <SendIcon sx={{ fontSize: 28 }} />, label: "Enviar", action: () => navigate("/send"), color: "#0070BA" },
    { icon: <RequestIcon sx={{ fontSize: 28 }} />, label: "Solicitar", action: () => navigate("/request"), color: "#6c757d" },
    { icon: <LinkIcon sx={{ fontSize: 28 }} />, label: "Crear Link", action: () => navigate("/send?tab=link"), color: "#28a745" },
    { icon: <QrIcon sx={{ fontSize: 28 }} />, label: "Código QR", action: () => navigate("/qr"), color: "#dc3545" },
  ]

  return (
    <Fade in={!loading}>
      <Box>
        <Card sx={{ mb: 4, bgcolor: "primary.main", color: "white", borderRadius: 4, background: 'linear-gradient(135deg, #0070BA 0%, #005ea6 100%)' }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="body1" sx={{ opacity: 0.9, mb: 1 }}>Saldo disponible</Typography>
            <Typography variant="h2" sx={{ fontWeight: 700, mb: 3, textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              {formatMoney(balance)}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" size="large" sx={{ bgcolor: "white", color: "primary.main", px: 4, py: 1.5, '&:hover': { bgcolor: '#f5f5f5' } }} onClick={() => navigate("/send")}>
                Enviar Dinero
              </Button>
              <Button variant="outlined" size="large" sx={{ borderColor: "white", color: "white", px: 4, py: 1.5, '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }} onClick={() => navigate("/wallet")}>
                Añadir Fondos
              </Button>
            </Box>
          </CardContent>
        </Card>

        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Acciones Rápidas</Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {quickActions.map((action, idx) => (
            <Grid item xs={6} md={3} key={idx}>
              <Slide direction="up" in={true} timeout={300 + idx * 100}>
                <Paper
                  sx={{ p: 3, textAlign: "center", cursor: "pointer", transition: "all 0.2s", '&:hover': { transform: "translateY(-4px)", boxShadow: 4 } }}
                  role="button"
                  tabIndex={0}
                  aria-label={action.label}
                  onClick={action.action}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action.action(); } }}
                >
                  <Box sx={{ color: action.color, mb: 1 }}>{action.icon}</Box>
                  <Typography variant="body1" fontWeight={600}>{action.label}</Typography>
                </Paper>
              </Slide>
            </Grid>
          ))}
        </Grid>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6" fontWeight={600}>Actividad Reciente</Typography>
              <Button component={Link} to="/activity" color="primary">Ver Todo</Button>
            </Box>
            
            {recentActivity.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="text.secondary">No hay actividad reciente</Typography>
                <Button variant="outlined" sx={{ mt: 2 }} onClick={() => navigate('/send')}>Hacer un pago</Button>
              </Box>
            ) : (
              recentActivity.map((payment) => (
                <Box key={payment.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 2, borderBottom: 1, borderColor: "divider", '&:last-child': { borderBottom: 0 } }}>
                  <Box>
                    <Typography fontWeight={600}>{payment.senderId === currentUser ? "Enviado" : "Recibido"}</Typography>
                    <Typography variant="body2" color="text.secondary">{payment.description || "Sin descripción"}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDate(payment.createdAt)}</Typography>
                  </Box>
                  <Typography fontWeight={700} fontSize="1.1rem" color={payment.senderId === currentUser ? "error.main" : "success.main"}>
                    {payment.senderId === currentUser ? "-" : "+"}{formatMoney(payment.amount.amount)}
                  </Typography>
                </Box>
              ))
            )}
          </CardContent>
        </Card>
      </Box>
    </Fade>
  )
}

function SendMoney({ currentUser }: { currentUser: string }) {
  const [recipientAlias, setRecipientAlias] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [balance, setBalance] = useState(0)

  useEffect(() => {
    axios.get(`${API_URL}/api/v1/wallets/${currentUser}/balance?currency=${CURRENCY}`).then(r => {
      if (r.data.success) setBalance(r.data.data.available)
    })
  }, [])

  const handleSend = async () => {
    if (!recipientAlias || !amount) { setError("Completa todos los campos"); return }
    if (parseFloat(amount) <= 0) { setError("El monto debe ser mayor a 0"); return }
    if (parseFloat(amount) > balance) { setError("Saldo insuficiente"); return }
    try {
      setLoading(true)
      setError("")
      const resolve = await axios.get(`${AUTH_URL}/api/v1/users/resolve`, { params: { alias: recipientAlias } })
      const receiverId = resolve.data?.data?.userId
      if (!receiverId) { setError("Alias no encontrado"); setLoading(false); return }
      const paymentRes = await axios.post(`${API_URL}/api/v1/payments`, {
        amount: { amount: parseFloat(amount), currency: CURRENCY, precision: 0 },
        senderId: currentUser, receiverId, type: "DIRECT_PAYMENT",
        description, idempotencyKey: `send-${Date.now()}-${receiverId}`
      })
      if (paymentRes.data.success) {
        await axios.post(`${API_URL}/api/v1/payments/${paymentRes.data.data.id}/process`)
        setSuccess(true)
        setRecipientAlias("")
        setAmount("")
        setDescription("")
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "Error al enviar")
    } finally { setLoading(false) }
  }


  return (
    <Container maxWidth="sm">
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Enviar Dinero</Typography>
      <Card>
        <CardContent sx={{ p: 4 }}>
          {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 3 }}>¡Pago enviado exitosamente!</Alert>}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Typography variant="body2" color="text.secondary">Saldo disponible: {formatMoney(balance)}</Typography>
            <TextField label="Alias del Destinatario" placeholder="Ej: juan.perez" value={recipientAlias} onChange={(e) => setRecipientAlias(e.target.value)} fullWidth variant="outlined" />
            <TextField label="Monto" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} fullWidth
              InputProps={{ startAdornment: <InputAdornment position="start">Gs.</InputAdornment> }} />
            <TextField label="Descripción (opcional)" placeholder="¿De qué se trata este pago?" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={2} />
            <Button variant="contained" size="large" onClick={handleSend} disabled={loading} sx={{ py: 1.5, mt: 1 }}>
              {loading ? "Procesando..." : "Enviar Dinero"}
            </Button>
            <Typography variant="body2" color="text.secondary">
              ¿Querés recibir dinero? Usá “Cobrar” para crear un link o QR.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Container>
  )
}

function RequestMoney({ currentUser }: { currentUser: string }) {
  const [amount, setAmount] = useState("")
  const [fromAlias, setFromAlias] = useState("")
  const [desc, setDesc] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async () => {
    if (!amount || !fromAlias) { setError("Completa todos los campos obligatorios"); return }
    setLoading(true)
    setError("")
    try {
      const resolve = await axios.get(`${AUTH_URL}/api/v1/users/resolve`, { params: { alias: fromAlias } })
      const senderId = resolve.data?.data?.userId
      if (!senderId) { setError("Alias no encontrado"); setLoading(false); return }
      await axios.post(`${API_URL}/api/v1/payments`, {
        amount: { amount: parseFloat(amount), currency: CURRENCY, precision: 0 },
        senderId, receiverId: currentUser, type: "DIRECT_PAYMENT",
        description: `Solicitud: ${desc}`, idempotencyKey: `request-${Date.now()}`
      })
      setSuccess(true)
      setAmount("")
      setFromAlias("")
      setDesc("")
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) { setError(err.response?.data?.error?.message || "Error") }
    setLoading(false)
  }

  return (
    <Container maxWidth="sm">
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Solicitar Dinero</Typography>
      <Card>
        <CardContent sx={{ p: 4 }}>
          {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 3 }}>¡Solicitud enviada! El usuario recibirá una notificación.</Alert>}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <TextField label="Solicitar a (Alias)" placeholder="Ej: juan.perez" value={fromAlias} onChange={(e) => setFromAlias(e.target.value)} fullWidth />
            <TextField label="Monto a solicitar" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} fullWidth
              InputProps={{ startAdornment: <InputAdornment position="start">Gs.</InputAdornment> }} />
            <TextField label="Motivo (opcional)" placeholder="¿Por qué estás solicitando este dinero?" value={desc} onChange={(e) => setDesc(e.target.value)} fullWidth multiline rows={3} />
            <Button variant="contained" size="large" onClick={handleSubmit} disabled={loading} sx={{ py: 1.5, mt: 1 }}>
              {loading ? "Enviando..." : "Enviar Solicitud"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  )
}

function Wallet({ currentUser }: { currentUser: string }) {
  const [balance, setBalance] = useState<WalletBalance | null>(null)
  const [depositAmount, setDepositAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [depositError, setDepositError] = useState("")
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => { fetchData() }, [currentUser])

  const fetchData = async () => {
    try {
      const [bRes, tRes] = await Promise.all([
        axios.get(`${API_URL}/api/v1/wallets/${currentUser}/balance?currency=${CURRENCY}`),
        axios.get(`${API_URL}/api/v1/wallets/${currentUser}/transactions?currency=${CURRENCY}`)
      ])
      if (bRes.data.success) setBalance(bRes.data.data)
      if (tRes.data.success) setTransactions(tRes.data.data)
    } catch (e) { console.error(e) }
  }

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return
    setLoading(true)
    try {
      const res = await axios.post(`${API_URL}/api/v1/wallets/${currentUser}/deposit`, {
        amount: parseFloat(depositAmount), currency: CURRENCY, description: "Depósito manual",
        idempotencyKey: `deposit-${Date.now()}`
      })
      if (res.data.success) {
        setSuccess(true)
        setDepositError("")
        setDepositAmount("")
        fetchData()
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (e: any) { setDepositError(e.response?.data?.error?.message || "Error al depositar") }
    setLoading(false)
  }

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Mi Cartera</Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: "primary.main", color: "white", height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ opacity: 0.9, mb: 1 }}>Saldo Disponible</Typography>
              <Typography variant="h3" fontWeight={700}>{balance ? formatMoney(balance.available) : "---"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography color="text.secondary" sx={{ mb: 1 }}>Retenido</Typography>
              <Typography variant="h3" fontWeight={700} color="text.secondary">{balance ? formatMoney(balance.held) : "---"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography color="text.secondary" sx={{ mb: 1 }}>Total</Typography>
              <Typography variant="h3" fontWeight={700}>{balance ? formatMoney(balance.total) : "---"}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>Añadir Fondos (Modo Desarrollo)</Typography>
              {success && <Alert severity="success" sx={{ mb: 3 }}>¡Fondos añadidos exitosamente!</Alert>}
              {depositError && <Alert severity="error" sx={{ mb: 2 }}>{depositError}</Alert>}
              <Box sx={{ display: "flex", gap: 2, flexWrap: 'wrap' }}>
                <TextField label="Monto a depositar" type="number" placeholder="0" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">Gs.</InputAdornment> }} sx={{ flexGrow: 1, minWidth: 200 }} />
                <Button variant="contained" size="large" onClick={handleDeposit} disabled={loading} sx={{ px: 4 }}>
                  {loading ? "..." : "Depositar"}
                </Button>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                En producción, aquí se conectaría con gateways de pago (tarjetas, transferencias bancarias, etc.)
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Historial de Transacciones</Typography>
              {transactions.length === 0 ? (
                <Typography color="text.secondary" align="center" py={4}>No hay transacciones</Typography>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow><TableCell>Fecha</TableCell><TableCell>Tipo</TableCell><TableCell>Descripción</TableCell><TableCell align="right">Monto</TableCell></TableRow>
                  </TableHead>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{formatDate(tx.created_at)}</TableCell>
                        <TableCell><Chip label={tx.type} color={tx.type === 'CREDIT' ? 'success' : tx.type === 'DEBIT' ? 'error' : 'default'} size="small" /></TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell align="right" sx={{ color: tx.type === 'CREDIT' ? 'success.main' : tx.type === 'DEBIT' ? 'error.main' : 'inherit', fontWeight: 600 }}>
                          {tx.type === 'CREDIT' ? '+' : tx.type === 'DEBIT' ? '-' : ''}{formatMoney(tx.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  )
}

function Activity({ currentUser }: { currentUser: string }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API_URL}/api/v1/payments?userId=${currentUser}`).then(r => {
      if (r.data.success) setPayments(r.data.data)
      setLoading(false)
    })
  }, [currentUser])

  const getStateColor = (state: string) => {
    switch (state) { case 'COMPLETED': return 'success'; case 'PENDING': return 'warning'; case 'FAILED': return 'error'; default: return 'default'; }
  }

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Actividad</Typography>
      <Card>
        <CardContent>
          {loading ? <Typography align="center" py={4}>Cargando...</Typography> : payments.length === 0 ? (
            <Typography color="text.secondary" align="center" py={4}>No hay actividad para mostrar</Typography>
          ) : (
            <Table>
              <TableHead>
                <TableRow><TableCell>Fecha</TableCell><TableCell>Tipo</TableCell><TableCell>Descripción</TableCell><TableCell>Estado</TableCell><TableCell align="right">Monto</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.createdAt)}</TableCell>
                    <TableCell>{p.senderId === currentUser ? "Enviado" : "Recibido"}</TableCell>
                    <TableCell>{p.description || "Sin descripción"}</TableCell>
                    <TableCell><Chip label={p.state} color={getStateColor(p.state) as any} size="small" /></TableCell>
                    <TableCell align="right" sx={{ color: p.senderId === currentUser ? 'error.main' : 'success.main', fontWeight: 700, fontSize: '1.1rem' }}>
                      {p.senderId === currentUser ? "-" : "+"}{formatMoney(p.amount.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Container>
  )
}

function QRCodePage({ currentUser }: { currentUser: string }) {
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [qrValue, setQrValue] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const generateQR = () => {
    setLoading(true)
    setError("")
    if (amount && parseFloat(amount) < 0) {
      setError("El monto no puede ser negativo")
      setLoading(false)
      return
    }
    const payload: any = {
      currency: CURRENCY,
      description,
      receiverId: currentUser,
      singleUse: false,
      idempotencyKey: `qr-${Date.now()}`
    }
    if (amount) payload.amount = parseFloat(amount)
    axios.post(`${API_URL}/api/v1/payment-links`, payload).then(res => {
      if (res.data.success && res.data.data?.url) {
        setQrValue(res.data.data.url)
      } else {
        setError("No se pudo generar el link para QR")
      }
    }).catch(() => setError("Error al generar el QR"))
      .finally(() => setLoading(false))
  }

  return (
    <Container maxWidth="md">
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Código QR de Pago</Typography>
      <Card>
        <CardContent sx={{ p: 4 }}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <TextField label="Monto solicitado (opcional)" type="number" placeholder="Dejar en blanco para que decida" value={amount} onChange={(e) => setAmount(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">Gs.</InputAdornment> }} fullWidth sx={{ mb: 2 }} />
              <TextField label="Descripción" placeholder="¿Para qué es este pago?" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={2} fullWidth sx={{ mb: 3 }} />
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              <Button variant="contained" size="large" fullWidth onClick={generateQR} disabled={loading} sx={{ py: 1.5 }}>{loading ? "Generando..." : "Generar QR"}</Button>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ textAlign: "center", p: 4, bgcolor: "grey.50", borderRadius: 2, minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {qrValue ? (
                  <Box role="img" aria-label="Código QR para pagar">
                    <QRCodeCanvas value={qrValue} size={200} level="H" />
                    <Typography variant="caption" display="block" sx={{ mt: 2, color: 'text.secondary' }}>Escanea para pagar</Typography>
                    <Paper sx={{ p: 1, mt: 2, wordBreak: 'break-all' }}>
                      <Typography variant="caption">{qrValue}</Typography>
                    </Paper>
                    <Button variant="text" size="small" onClick={() => navigator.clipboard.writeText(qrValue)} sx={{ mt: 1 }}>
                      Copiar URL
                    </Button>
                  </Box>
                ) : <Typography color="text.secondary">Configura el monto y genera tu código QR</Typography>}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Container>
  )
}

function PayLinkPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [link, setLink] = useState<PaymentLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [payerId, setPayerId] = useState(() => localStorage.getItem("currentUser") || "")
  const [paying, setPaying] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    axios.get(`${API_URL}/api/v1/payment-links/${id}`).then(r => {
      if (r.data.success) setLink(r.data.data)
      else setError("Link no encontrado")
      setLoading(false)
    }).catch(() => { setError("Error al cargar"); setLoading(false) })
  }, [id])

  const handlePay = async () => {
    if (!payerId) { setError("Ingresa tu ID de usuario"); return }
    if (link && payerId === link.merchantId) { setError("No podés pagar tu propio link"); return }
    setPaying(true)
    setError("")
    try {
      const res = await axios.post(`${API_URL}/api/v1/payment-links/${id}/pay`, { payerId, idempotencyKey: `paylink-${Date.now()}` })
      if (res.data.success) setSuccess(true)
    } catch (err: any) { setError(err.response?.data?.error?.message || "Error al procesar") }
    setPaying(false)
  }

  if (loading) return <Container maxWidth="sm"><Typography align="center" py={8}>Cargando...</Typography></Container>
  if (error) return <Container maxWidth="sm"><Alert severity="error" sx={{ mt: 4 }}>{error}</Alert></Container>
  if (!link) return <Container maxWidth="sm"><Alert severity="error" sx={{ mt: 4 }}>Link no encontrado</Alert></Container>

  if (success) return (
    <Container maxWidth="sm" sx={{ mt: 8, textAlign: "center" }}>
      <CheckCircle color="success" sx={{ fontSize: 80, mb: 2 }} />
      <Typography variant="h4" fontWeight={700} gutterBottom>¡Pago Exitoso!</Typography>
      <Typography variant="h5" sx={{ mb: 1 }}>{formatMoney(link.amount)}</Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>Pagado a {link.merchantId}</Typography>
      <Button variant="contained" size="large" onClick={() => navigate("/")}>Volver al Inicio</Button>
    </Container>
  )

  return (
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Card sx={{ borderRadius: 4 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={700} align="center" sx={{ mb: 1 }}>Pago Solicitado</Typography>
          <Typography variant="h3" fontWeight={700} align="center" color="primary.main" sx={{ mb: 2 }}>{formatMoney(link.amount)}</Typography>
          {link.description && <Typography align="center" color="text.secondary" sx={{ mb: 3 }}>{link.description}</Typography>}
          <Box sx={{ bgcolor: "grey.100", p: 2, borderRadius: 2, mb: 3, textAlign: 'center' }}>
            <Typography variant="body2">Pagando a: <strong>{link.merchantId}</strong></Typography>
          </Box>
          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          <TextField label="Tu ID de Usuario" placeholder="Ej: user-123" value={payerId} onChange={(e) => setPayerId(e.target.value)} fullWidth sx={{ mb: 3 }} />
          <Button variant="text" onClick={() => setPayerId(localStorage.getItem("currentUser") || "")} sx={{ mb: 2 }} disabled={link && (localStorage.getItem("currentUser") || "") === link.merchantId}>
            Usar mi usuario actual
          </Button>
          <Button variant="contained" size="large" fullWidth onClick={handlePay} disabled={paying || (link ? payerId === link.merchantId : false)} sx={{ py: 1.5, fontWeight: 600 }}>
            {paying ? "Procesando..." : "Pagar Ahora"}
          </Button>
        </CardContent>
      </Card>
    </Container>
  )
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem("currentUser") || "")
  const [permissions, setPermissions] = useState<string[]>(() => JSON.parse(localStorage.getItem("permissions") || "[]"))
  const [balance, setBalance] = useState(0)

  useEffect(() => { localStorage.setItem("currentUser", currentUser); localStorage.setItem("permissions", JSON.stringify(permissions)) }, [currentUser, permissions])
  
  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/v1/wallets/${currentUser}/balance?currency=${CURRENCY}`)
        if (res.data.success) setBalance(res.data.data.available)
      } catch (e) { console.error(e) }
    }
    fetchBalance()
    const interval = setInterval(fetchBalance, 5000)
    return () => clearInterval(interval)
  }, [currentUser])

  const LoginPage = () => {
    const navigate = useNavigate()
    const [mode, setMode] = useState<'login'|'register'>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const submit = async () => {
      setLoading(true); setError('')
      try {
        const url = mode === 'login' ? `${AUTH_URL}/api/v1/auth/login` : `${AUTH_URL}/api/v1/auth/register`
        const payload = mode === 'login' ? { email, password } : { email, password, firstName, lastName }
        const res = await axios.post(url, payload)
        if (res.data.success) {
          setCurrentUser(res.data.user.id)
          setPermissions(res.data.user.permissions || [])
          localStorage.setItem('email', res.data.user.email || '')
          navigate('/')
        } else {
          setError(res.data.error?.message || 'Error')
        }
      } catch (e: any) {
        setError(e.response?.data?.error?.message || 'Error')
      } finally { setLoading(false) }
    }
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>{mode === 'login' ? 'Iniciar Sesión' : 'Registrarse'}</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
              <TextField label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
              {mode === 'register' && (
                <>
                  <TextField label="Nombre" value={firstName} onChange={(e) => setFirstName(e.target.value)} fullWidth />
                  <TextField label="Apellido" value={lastName} onChange={(e) => setLastName(e.target.value)} fullWidth />
                </>
              )}
              <Button variant="contained" size="large" onClick={submit} disabled={loading}>{loading ? '...' : (mode === 'login' ? 'Entrar' : 'Registrarse')}</Button>
              <Button variant="text" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? 'Crear una cuenta' : 'Ya tengo cuenta'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    )
  }
  
  const ProfilePage = () => {
    const [alias, setAlias] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    useEffect(() => {
      axios.get(`${AUTH_URL}/api/v1/users/${localStorage.getItem('currentUser') || ''}`).then(r => {
        setAlias(r.data?.data?.alias || '')
      }).catch(() => {})
    }, [])
    const save = async () => {
      setLoading(true); setMessage('')
      try {
        const res = await axios.post(`${AUTH_URL}/api/v1/users/alias`, { userId: localStorage.getItem('currentUser') || '', alias })
        if (res.data.success) setMessage('Alias guardado')
      } catch (e: any) {
        setMessage(e.response?.data?.error?.message || 'Error')
      } finally { setLoading(false) }
    }
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Perfil</Typography>
            {message && <Alert severity={message === 'Alias guardado' ? 'success' : 'error'} sx={{ mb: 2 }}>{message}</Alert>}
            <TextField label="Alias" placeholder="tu.alias" value={alias} onChange={(e) => setAlias(e.target.value)} fullWidth sx={{ mb: 2 }} />
            <Button variant="contained" onClick={save} disabled={loading}>{loading ? '...' : 'Guardar Alias'}</Button>
          </CardContent>
        </Card>
      </Container>
    )
  }
  
  const CollectMoney = () => {
    const [amount, setAmount] = useState("")
    const [description, setDescription] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [createdLink, setCreatedLink] = useState<PaymentLink | null>(null)
    const create = async () => {
      if (amount && parseFloat(amount) <= 0) { setError("Ingresa un monto mayor a 0"); return }
      try {
        setLoading(true); setError("")
        const res = await axios.post(`${API_URL}/api/v1/payment-links`, {
          amount: amount ? parseFloat(amount) : undefined, currency: CURRENCY, description,
          receiverId: localStorage.getItem('currentUser') || '', singleUse: false, idempotencyKey: `link-${Date.now()}`
        })
        if (res.data.success) {
          setCreatedLink(res.data.data)
          setAmount(""); setDescription("")
        } else { setError(res.data.error?.message || "Error") }
      } catch (e: any) { setError(e.response?.data?.error?.message || "Error al crear link") }
      setLoading(false)
    }
    return (
      <Container maxWidth="sm">
        <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Cobrar</Typography>
        <Card>
          <CardContent sx={{ p: 4 }}>
            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
            {createdLink ? (
              <Box sx={{ textAlign: "center", py: 2 }}>
                <CheckCircle color="success" sx={{ fontSize: 64, mb: 2 }} />
                <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>Link creado exitosamente</Typography>
                {typeof createdLink.amount === 'number' && <Typography variant="h5" color="primary.main" fontWeight={700} sx={{ mb: 3 }}>{formatMoney(createdLink.amount)}</Typography>}
                <Paper sx={{ p: 2, bgcolor: "grey.50", mb: 3, wordBreak: "break-all" }}>
                  <Typography variant="body2" fontFamily="monospace">{createdLink.url}</Typography>
                </Paper>
                <Button variant="contained" startIcon={<ContentCopy />} onClick={() => { navigator.clipboard.writeText(createdLink.url) }} sx={{ mb: 2 }}>
                  Copiar Link
                </Button>
                <Button variant="outlined" onClick={() => { window.open(createdLink.url, '_blank') }} sx={{ mb: 2, ml: 1 }}>
                  Abrir Link
                </Button>
                <Box><Button variant="text" onClick={() => setCreatedLink(null)}>Crear otro link</Button></Box>
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <TextField label="Monto a cobrar (opcional)" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} fullWidth
                  InputProps={{ startAdornment: <InputAdornment position="start">Gs.</InputAdornment> }} />
                <TextField label="Descripción (opcional)" placeholder="¿Para qué es este cobro?" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={2} />
                <Button variant="contained" size="large" onClick={create} disabled={loading} sx={{ py: 1.5, mt: 1 }}>
                  {loading ? "Creando..." : "Crear Link de Cobro"}
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Compartí este link para recibir pagos. También podés generar un QR en la sección QR.
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Container>
    )
  }
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/pay/:id" element={<PayLinkPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={
            <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
              <Navigation currentUser={currentUser || 'Invitado'} balance={balance} />
              <Container maxWidth="lg" sx={{ pb: 4 }}>
                <Routes>
                  <Route path="/" element={currentUser ? <Dashboard currentUser={currentUser} /> : <LoginPage />} />
                  <Route path="/send" element={currentUser ? <SendMoney currentUser={currentUser} /> : <LoginPage />} />
                  <Route path="/request" element={currentUser ? <RequestMoney currentUser={currentUser} /> : <LoginPage />} />
                  <Route path="/collect" element={currentUser ? <CollectMoney /> : <LoginPage />} />
                  <Route path="/wallet" element={currentUser ? <Wallet currentUser={currentUser} /> : <LoginPage />} />
                  <Route path="/activity" element={currentUser ? <Activity currentUser={currentUser} /> : <LoginPage />} />
                  <Route path="/qr" element={currentUser ? <QRCodePage currentUser={currentUser} /> : <LoginPage />} />
                  <Route path="/profile" element={currentUser ? <ProfilePage /> : <LoginPage />} />
                </Routes>
              </Container>
            </Box>
          } />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
