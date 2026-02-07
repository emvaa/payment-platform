import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from './slices/authSlice';
import { paymentsSlice } from './slices/paymentsSlice';
import { walletSlice } from './slices/walletSlice';
import { uiSlice } from './slices/uiSlice';
import { notificationsSlice } from './slices/notificationsSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    payments: paymentsSlice.reducer,
    wallet: walletSlice.reducer,
    ui: uiSlice.reducer,
    notifications: notificationsSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

export type RootState = ReturnType<typeof store>;
export type AppDispatch = typeof store.dispatch;
