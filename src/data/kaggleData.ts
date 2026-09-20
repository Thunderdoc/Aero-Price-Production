/**
 * Kaggle Flight Price Prediction dataset — pre-computed statistics.
 * Source: https://www.kaggle.com/datasets/nikhilmittal/flight-fare-prediction-mh/
 * Coverage: Indian domestic flights, March–June 2019
 * Observations: 10,683 training rows, 2,671 test rows
 * data_origin: GENERATED_TEST (historical public dataset, not real-time)
 *
 * These statistics are computed from the raw Excel files and baked in
 * to avoid runtime parsing. Update by re-running the analysis script.
 */

export const DATASET_META = {
  name: 'Kaggle Flight Price Prediction',
  source_url: 'https://www.kaggle.com/datasets/nikhilmittal/flight-fare-prediction-mh/',
  total_train: 10683,
  total_test: 2671,
  coverage: 'Indian domestic, March–June 2019',
  data_origin: 'GENERATED_TEST' as const,
  months: ['March', 'April', 'May', 'June'],
  price_unit: 'INR',
}

// ── Airline statistics ──────────────────────────────────────────────────────
export interface AirlineStat {
  airline: string
  count: number
  avg_price: number
  min_price: number
  max_price: number
  share_pct: number      // % of total observations
}

export const AIRLINE_STATS: AirlineStat[] = [
  { airline: 'Jet Airways',        count: 3849, avg_price: 11644, min_price: 1840,  max_price: 54826, share_pct: 36.0 },
  { airline: 'IndiGo',             count: 2053, avg_price: 5674,  min_price: 2227,  max_price: 22153, share_pct: 19.2 },
  { airline: 'Multiple carriers',  count: 1196, avg_price: 10903, min_price: 5797,  max_price: 36983, share_pct: 11.2 },
  { airline: 'Air India',          count: 1752, avg_price: 9611,  min_price: 2050,  max_price: 31945, share_pct: 16.4 },
  { airline: 'SpiceJet',           count: 818,  avg_price: 4338,  min_price: 1759,  max_price: 23267, share_pct: 7.7  },
  { airline: 'Vistara',            count: 479,  avg_price: 7796,  min_price: 3687,  max_price: 21730, share_pct: 4.5  },
  { airline: 'Air Asia',           count: 319,  avg_price: 5590,  min_price: 3383,  max_price: 13774, share_pct: 3.0  },
  { airline: 'GoAir',              count: 194,  avg_price: 5861,  min_price: 3398,  max_price: 22794, share_pct: 1.8  },
  { airline: 'Jet Airways Business', count: 6,  avg_price: 58359, min_price: 46490, max_price: 79512, share_pct: 0.1  },
]

// ── Stops analysis ──────────────────────────────────────────────────────────
export interface StopsStat {
  stops: string
  count: number
  avg_price: number
  share_pct: number
}

export const STOPS_STATS: StopsStat[] = [
  { stops: 'Non-stop',  count: 3491, avg_price: 5025,  share_pct: 32.7 },
  { stops: '1 Stop',    count: 5625, avg_price: 10594, share_pct: 52.7 },
  { stops: '2 Stops',   count: 1520, avg_price: 12716, share_pct: 14.2 },
  { stops: '3+ Stops',  count: 46,   avg_price: 13553, share_pct: 0.4  },
]

// ── Route statistics ────────────────────────────────────────────────────────
export interface RouteStat {
  route: string
  origin: string
  destination: string
  count: number
  avg_price: number
  min_price: number
  max_price: number
}

export const ROUTE_STATS: RouteStat[] = [
  { route: 'Delhi → Cochin',      origin: 'Delhi',     destination: 'Cochin',     count: 4537, avg_price: 10539, min_price: 3876,  max_price: 52285 },
  { route: 'Kolkata → Banglore',  origin: 'Kolkata',   destination: 'Banglore',   count: 2871, avg_price: 9158,  min_price: 3480,  max_price: 31945 },
  { route: 'Banglore → Delhi',    origin: 'Banglore',  destination: 'Delhi',      count: 1265, avg_price: 5144,  min_price: 3257,  max_price: 8541  },
  { route: 'Banglore → New Delhi',origin: 'Banglore',  destination: 'New Delhi',  count: 932,  avg_price: 11918, min_price: 3383,  max_price: 79512 },
  { route: 'Mumbai → Hyderabad',  origin: 'Mumbai',    destination: 'Hyderabad',  count: 697,  avg_price: 5060,  min_price: 1759,  max_price: 25139 },
  { route: 'Chennai → Kolkata',   origin: 'Chennai',   destination: 'Kolkata',    count: 381,  avg_price: 4790,  min_price: 3145,  max_price: 19630 },
]

// ── Price histogram ──────────────────────────────────────────────────────────
export interface HistogramBucket {
  label: string
  min: number
  max: number
  count: number
}

export const PRICE_HISTOGRAM: HistogramBucket[] = [
  { label: '<₹2K',     min: 0,     max: 2000,   count: 41   },
  { label: '₹2-4K',    min: 2000,  max: 4000,   count: 1120 },
  { label: '₹4-6K',    min: 4000,  max: 6000,   count: 2006 },
  { label: '₹6-8K',    min: 6000,  max: 8000,   count: 1858 },
  { label: '₹8-10K',   min: 8000,  max: 10000,  count: 1288 },
  { label: '₹10-15K',  min: 10000, max: 15000,  count: 3545 },
  { label: '₹15-20K',  min: 15000, max: 20000,  count: 677  },
  { label: '₹20-30K',  min: 20000, max: 30000,  count: 124  },
  { label: '>₹30K',    min: 30000, max: 100000, count: 24   },
]

// ── Monthly trends ──────────────────────────────────────────────────────────
export interface MonthStat {
  month: string
  month_short: string
  count: number
  avg_price: number
}

export const MONTHLY_STATS: MonthStat[] = [
  { month: 'March', month_short: 'Mar', count: 2724, avg_price: 10673 },
  { month: 'April', month_short: 'Apr', count: 1079, avg_price: 5771  },
  { month: 'May',   month_short: 'May', count: 3466, avg_price: 9127  },
  { month: 'June',  month_short: 'Jun', count: 3414, avg_price: 8829  },
]

// ── Duration vs price ────────────────────────────────────────────────────────
export interface DurationBucket {
  label: string
  avg_price: number
  count: number
}

export const DURATION_BUCKETS: DurationBucket[] = [
  { label: '< 2h',    avg_price: 3954,  count: 622  },
  { label: '2–4h',    avg_price: 5268,  count: 2903 },
  { label: '4–6h',    avg_price: 8242,  count: 703  },
  { label: '6–10h',   avg_price: 11190, count: 1696 },
  { label: '10–15h',  avg_price: 11148, count: 1892 },
  { label: '> 15h',   avg_price: 11671, count: 2867 },
]

// ── Airline × Stops price matrix ─────────────────────────────────────────────
export interface AirlineStopsMatrix {
  airline: string
  non_stop: number | null
  one_stop: number | null
  two_stops: number | null
}

export const AIRLINE_STOPS_MATRIX: AirlineStopsMatrix[] = [
  { airline: 'IndiGo',    non_stop: 4731, one_stop: 7105,  two_stops: 7508  },
  { airline: 'SpiceJet',  non_stop: 3805, one_stop: 6751,  two_stops: null  },
  { airline: 'GoAir',     non_stop: 4726, one_stop: 6885,  two_stops: null  },
  { airline: 'Air Asia',  non_stop: 5133, one_stop: 6047,  two_stops: null  },
  { airline: 'Vistara',   non_stop: 6294, one_stop: 9641,  two_stops: null  },
  { airline: 'Air India', non_stop: 5605, one_stop: 9042,  two_stops: 12093 },
  { airline: 'Jet Airways',non_stop: null,one_stop: 10399, two_stops: 14266 },
]

// ── Overall summary ──────────────────────────────────────────────────────────
export const OVERALL_STATS = {
  total_obs: 10683,
  overall_avg: 9087,
  overall_min: 1759,
  overall_max: 79512,
  median_estimate: 8340,
  cheapest_airline: 'SpiceJet',
  most_expensive_airline: 'Jet Airways Business',
  most_common_stops: '1 Stop',
  busiest_route: 'Delhi → Cochin',
}
