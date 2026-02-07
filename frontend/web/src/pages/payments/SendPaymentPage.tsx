import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Chip,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Divider,
} from '@mui/material';
import {
  AccountBalanceWallet,
  Person,
  Schedule,
  Security,
  AttachMoney,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useSelector, useDispatch } from 'react-redux';
import { useMutation, useQuery } from 'react-query';

import { RootState } from '../../store/store';
import { createPayment } from '../../store/slices/paymentsSlice';
import { fetchWalletBalance } from '../../store/slices/walletSlice';
import { showNotification } from '../../store/slices/notificationsSlice';

interface PaymentFormData {
  type: string;
  amount: string;
  currency: string;
  recipientEmail?: string;
  description: string;
  scheduledDate?: string;
}

const SendPaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);
  
  const { data: walletBalance } = useQuery(
    ['walletBalance'],
    () => fetchWalletBalance(),
    {
      select: (response: any) => response.data,
    }
  );

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PaymentFormData>({
    defaultValues: {
      type: 'DIRECT_PAYMENT',
      amount: '',
      currency: 'USD',
      description: '',
    }
  });

  const [activeStep, setActiveStep] = useState(0);
  const [recipient, setRecipient] = useState('');
  const [isSearchingRecipient, setIsSearchingRecipient] = useState(false);
  const [recipientSuggestions, setRecipientSuggestions] = useState<any[]>([]);

  const createPaymentMutation = useMutation(
    createPayment,
    {
      onSuccess: (data) => {
        dispatch(showNotification({
          type: 'success',
          title: 'Payment Created',
          message: `Payment of ${data.amount.currency} ${data.amount.amount} has been created successfully.`,
        }));
        
        dispatch(fetchWalletBalance());
        navigate(`/payments/${data.id}`);
      },
      onError: (error: any) => {
        dispatch(showNotification({
          type: 'error',
          title: 'Payment Failed',
          message: error.message || 'Failed to create payment',
        }));
      },
    }
  );

  const steps = [
    {
      label: 'Payment Details',
      icon: <AttachMoney />,
    },
    {
      label: 'Recipient',
      icon: <Person />,
    },
    {
      label: 'Review',
      icon: <Security />,
    },
    {
      label: 'Confirmation',
      icon: <Schedule />,
    },
  ];

  const handleRecipientSearch = async (email: string) => {
    setIsSearchingRecipient(true);
    try {
      // Mock API call to search users
      const response = await fetch(`/api/v1/users/search?email=${email}`);
      if (response.ok) {
        const data = await response.json();
        setRecipientSuggestions(data.users || []);
      }
    } catch (error) {
      console.error('Error searching recipient:', error);
    } finally {
      setIsSearchingRecipient(false);
    }
  };

  const onSubmit = (data: PaymentFormData) => {
    const paymentData = {
      ...data,
      amount: {
        amount: parseFloat(data.amount),
        currency: data.currency,
        precision: 2,
      },
      senderId: user?.id,
      receiverId: recipient?.id || undefined,
      metadata: {
        source: 'web',
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
    };

    createPaymentMutation.mutateAsync(paymentData);
  };

  const nextStep = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const backStep = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Payment Information
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel id="payment-type-label">Payment Type</InputLabel>
                      <Select
                        {...field}
                        labelId="payment-type-label"
                        label="Payment Type"
                      >
                        <MenuItem value="DIRECT_PAYMENT">Direct Payment</MenuItem>
                        <MenuItem value="PAYMENT_LINK">Payment Link</MenuItem>
                        <MenuItem value="WITHDRAWAL">Withdrawal</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
                {errors.type && (
                  <Typography color="error" variant="caption">
                    {errors.type.message}
                  </Typography>
                )}
              </Grid>
              
              <Grid item xs={12}>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Amount"
                      type="number"
                      fullWidth
                      InputProps={{
                        startAdornment: <AttachMoney />,
                      }}
                    />
                  )}
                />
                {errors.amount && (
                  <Typography color="error" variant="caption">
                    {errors.amount.message}
                  </Typography>
                )}
              </Grid>
              
              <Grid item xs={12}>
                <Controller
                  name="currency"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel id="currency-label">Currency</InputLabel>
                      <Select
                        {...field}
                        labelId="currency-label"
                        label="Currency"
                      >
                        <MenuItem value="USD">USD - US Dollar</MenuItem>
                        <MenuItem value="EUR">EUR - Euro</MenuItem>
                        <MenuItem value="GBP">GBP - British Pound</MenuItem>
                        <MenuItem value="JPY">JPY - Japanese Yen</MenuItem>
                        <MenuItem value="CAD">CAD - Canadian Dollar</MenuItem>
                        <MenuItem value="AUD">AUD - Australian Dollar</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
                {errors.currency && (
                  <Typography color="error" variant="caption">
                    {errors.currency.message}
                  </Typography>
                )}
              </Grid>
              
              <Grid item xs={12}>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Description (Optional)"
                      multiline
                      rows={3}
                      fullWidth
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Box>
        );
      
      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Recipient Information
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Recipient Email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && recipient) {
                      handleRecipientSearch(recipient);
                    }
                  }}
                  InputProps={{
                    endAdornment: isSearchingRecipient ? <CircularProgress size={20} /> : null,
                  }}
                />
                {recipientSuggestions.length > 0 && (
                  <Box mt={2}>
                    <Typography variant="subtitle2" gutterBottom>
                      Suggestions
                    </Typography>
                    {recipientSuggestions.map((suggestion: any) => (
                      <Chip
                        key={suggestion.id}
                        label={`${suggestion.firstName} ${suggestion.lastName} - ${suggestion.email}`}
                        onClick={() => {
                          setRecipient(suggestion.email);
                          setRecipientSuggestions([]);
                        }}
                        sx={{ mr: 1, mb: 1 }}
                      />
                    ))}
                  </Box>
                )}
              </Grid>
            </Grid>
          </Box>
        );
      
      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Review Payment
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              Please review all payment details before confirming
            </Alert>
            
            <Card variant="outlined">
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">Payment Type</Typography>
                    <Typography variant="body1">{control.getValues().type}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">Amount</Typography>
                    <Typography variant="body1">
                      {control.getValues().currency} {control.getValues().amount}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2">Description</Typography>
                    <Typography variant="body1">{control.getValues().description || 'No description'}</Typography>
                  </Grid>
                  {recipient && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2">Recipient</Typography>
                      <Typography variant="body1">{recipient}</Typography>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
            
            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={backStep}
              >
                Back
              </Button>
              <Button
                variant="contained"
                onClick={handleSubmit(onSubmit)}
                disabled={createPaymentMutation.isLoading}
                startIcon={createPaymentMutation.isLoading ? <CircularProgress size={20} /> : <Schedule />}
              >
                {createPaymentMutation.isLoading ? 'Processing...' : 'Confirm Payment'}
              </Button>
            </Box>
          </Box>
        );
      
      case 3:
        return (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            {createPaymentMutation.isLoading ? (
              <Box>
                <CircularProgress size={60} />
                <Typography variant="h6" sx={{ mt: 2 }}>
                  Processing Payment...
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Please wait while we process your payment
                </Typography>
              </Box>
            ) : createPaymentMutation.isSuccess ? (
              <Box>
                <Typography variant="h4" color="success.main" gutterBottom>
                  ✅ Payment Created Successfully!
                </Typography>
                <Typography variant="body1" gutterBottom>
                  Your payment has been created and is being processed.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => navigate('/dashboard')}
                  sx={{ mt: 3 }}
                >
                  Go to Dashboard
                </Button>
              </Box>
            ) : createPaymentMutation.isError ? (
              <Box>
                <Typography variant="h4" color="error.main" gutterBottom>
                  ❌ Payment Failed
                </Typography>
                <Typography variant="body1" color="error" gutterBottom>
                  {createPaymentMutation.error?.message || 'An error occurred while creating your payment.'}
                </Typography>
                <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={backStep}
                  >
                    Back
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => reset()}
                  >
                    Try Again
                  </Button>
                </Box>
              </Box>
            ) : null}
          </Box>
        );
      
      default:
        return null;
    }
  };

  if (!user) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Typography variant="h6">
          Please log in to access this page
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Send Payment
      </Typography>
      
      {walletBalance && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Available Balance: {walletBalance.currency} {walletBalance.available.amount.toFixed(2)}
        </Alert>
      )}
      
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label, index) => (
          <Step key={label.label}>
            <StepLabel>{label.label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      
      <Card>
        <CardContent sx={{ minHeight: 400 }}>
          {getStepContent(activeStep)}
        </CardContent>
      </Card>
    </Box>
  );
};

export default SendPaymentPage;
