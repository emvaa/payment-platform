import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Avatar,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  TrendingUp,
  AccountBalanceWallet,
  Payment,
  AttachMoney,
  People,
  Timeline,
  Assessment,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { useQuery } from 'react-query';
import { format } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';

import { RootState } from '../../store/store';
import { fetchDashboardStats } from '../../store/slices/dashboardSlice';
import { fetchRecentTransactions } from '../../store/slices/paymentsSlice';
import { fetchWalletBalance } from '../../store/slices/walletSlice';

const DashboardPage: React.FC = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);
  
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError
  } = useQuery(
    ['dashboardStats'],
    () => fetchDashboardStats(),
    {
      refetchInterval: 30000, // 30 seconds
      select: (response: any) => response.data,
    }
  );

  const {
    data: transactions,
    isLoading: transactionsLoading
  } = useQuery(
    ['recentTransactions'],
    () => fetchRecentTransactions({ limit: 5 }),
    {
      select: (response: any) => response.data?.items || [],
    }
  );

  const {
    data: walletBalance
  } = useQuery(
    ['walletBalance'],
    () => fetchWalletBalance(),
    {
      select: (response: any) => response.data,
    }
  );

  const [timeRange, setTimeRange] = useState('7d');

  const StatCard: React.FC<{
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color?: string;
    trend?: {
      value: number;
      isPositive: boolean;
    };
  }> = ({ title, value, icon, color = 'primary', trend }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" alignItems="center" mb={2}>
          <Avatar sx={{ bgcolor: `${color}.main`, mr: 2 }}>
            {icon}
          </Avatar>
          <Box>
            <Typography color="textSecondary" variant="h6" component="div">
              {title}
            </Typography>
            <Typography variant="h4" component="div">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </Typography>
          </Box>
        </Box>
        {trend && (
          <Box display="flex" alignItems="center">
            <TrendingUp 
              sx={{ 
                color: trend.isPositive ? 'success.main' : 'error.main',
                mr: 1
              }} 
            />
            <Typography 
              variant="body2" 
              sx={{ 
                color: trend.isPositive ? 'success.main' : 'error.main',
                fontWeight: 'bold'
              }}
            >
              {Math.abs(trend.value)}%
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const TransactionItem: React.FC<{ transaction: any }> = ({ transaction }) => (
    <ListItem>
      <ListItemIcon>
        <Payment color={transaction.state === 'COMPLETED' ? 'success' : 'warning'} />
      </ListItemIcon>
      <ListItemText
        primary={transaction.description || 'Payment'}
        secondary={format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
      />
      <ListItemText secondary>
        <Typography variant="h6" color="primary">
          ${transaction.amount.currency} ${transaction.amount.amount.toFixed(2)}
        </Typography>
        <Chip 
          label={transaction.state} 
          size="small" 
          color={transaction.state === 'COMPLETED' ? 'success' : 'warning'}
          sx={{ ml: 1 }}
        />
      </ListItemText>
    </ListItem>
  );

  if (statsLoading || transactionsLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <LinearProgress />
      </Box>
    );
  }

  if (statsError) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Typography color="error" variant="h6">
          Error loading dashboard data
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Welcome back, {user?.firstName}! 👋
      </Typography>
      
      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Balance"
            value={walletBalance ? `${walletBalance.currency} ${walletBalance.total.amount.toFixed(2)}` : '$0.00'}
            icon={<AccountBalanceWallet />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Available"
            value={walletBalance ? `${walletBalance.currency} ${walletBalance.available.amount.toFixed(2)}` : '$0.00'}
            icon={<AttachMoney />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Transactions"
            value={stats?.totalTransactions || 0}
            icon={<Payment />}
            trend={{
              value: stats?.transactionGrowth || 0,
              isPositive: (stats?.transactionGrowth || 0) >= 0
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Success Rate"
            value={`${stats?.successRate || 0}%`}
            icon={<Assessment />}
            color="success"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Transaction Chart */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Transaction Volume
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats?.transactionVolume || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(value, name) => {
                        if (name === 'value') {
                          return `Transactions: ${value}`;
                        }
                        return `${name}: ${value}`;
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      stroke="#1976d2" 
                      strokeWidth={2}
                      dot={{ fill: '#1976d2', strokeWidth: 2, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Transaction Status Pie Chart */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Transaction Status
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.transactionStatus || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => entry.name}
                      outerRadius={80}
                      fill="#8884d8"
                    >
                      {stats?.transactionStatus?.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Recent Transactions */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Transactions
              </Typography>
              <List>
                {transactions?.slice(0, 5).map((transaction: any) => (
                  <TransactionItem key={transaction.id} transaction={transaction} />
                ))}
              </List>
              {transactions?.length === 0 && (
                <Box textAlign="center" py={3}>
                  <Typography color="textSecondary">
                    No recent transactions
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  startIcon={<AttachMoney />}
                  href="/payments/new"
                >
                  Send Payment
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<AccountBalanceWallet />}
                  href="/wallet"
                >
                  View Wallet
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<Timeline />}
                  href="/payment-links"
                >
                  Payment Links
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<People />}
                  href="/profile"
                >
                  Profile
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
