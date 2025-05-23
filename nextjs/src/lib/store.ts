import { configureStore, createSlice, PayloadAction } from "@reduxjs/toolkit";

type MetricsState = { clicks: number; mouseMiles: number };
const initial: MetricsState = { clicks: 0, mouseMiles: 0 };

const metricsSlice = createSlice({
  name: "metrics",
  initialState: initial,
  reducers: {
    addClicks: (s, a: PayloadAction<number>) => { s.clicks += a.payload; },
    addMiles:  (s, a: PayloadAction<number>) => { s.mouseMiles += a.payload; },
    resetSession: () => initial,
  },
});

export const { addClicks, addMiles, resetSession } = metricsSlice.actions;

export const store = configureStore({
  reducer: { metrics: metricsSlice.reducer },
  devTools: process.env.NODE_ENV !== "production",
});

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
