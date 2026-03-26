import { lazy, Suspense } from 'react'
import {  Route, Routes, BrowserRouter, Navigate } from 'react-router-dom'
import './App.css';
import Layout from "./components/layout.tsx";

const HomePage = lazy(() => import('./pages/Home.tsx'));
const PredictionPage = lazy(() => import('./pages/Predict.tsx'));
const ComparePage = lazy(() => import('./pages/Compare.tsx'));
const AnalyticsPage = lazy(() => import('./pages/Analytics.tsx'));

const RouteFallback = ({ text }: { text: string }) => (
  <div className="panel route-loader" role="status" aria-live="polite">
    <div className="loading-spinner" />
    <span>{text}</span>
  </div>
);

function App() {
  // const [count, setCount] = useState(0)

  return (
    <>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/predict" element={<Suspense fallback={<RouteFallback text="Loading predictor..." />}><PredictionPage /></Suspense>} />
          <Route path="/compare" element={<Suspense fallback={<RouteFallback text="Loading comparison..." />}><ComparePage /></Suspense>} />
          <Route path="/analytics" element={<Suspense fallback={<RouteFallback text="Loading analytics..." />}><AnalyticsPage /></Suspense>} />
          <Route path="/home" element={<Suspense fallback={<RouteFallback text="Loading dashboard..." />}><HomePage /></Suspense>} />


          <Route path="*" element = {<div> 404 Not Found </div>} />
        </Route>
      </Routes>
    </BrowserRouter>
    </>
  )
}

export default App