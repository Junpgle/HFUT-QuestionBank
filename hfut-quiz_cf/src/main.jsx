import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { RouteLoading, RouteError } from './components/RouteFallbacks';

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {});
      }
    });
  },
});

const App = lazy(() => import('./App.jsx'));
const Report = lazy(() => import('./Report.jsx'));
const Introduce = lazy(() => import('./Introduce.jsx'));
const Register = lazy(() => import('./Register.jsx'));

const withSuspense = (element) => (
  <Suspense fallback={<RouteLoading />}>{element}</Suspense>
);

const router = createHashRouter([
  { path: '/', element: withSuspense(<App />), errorElement: <RouteError /> },
  { path: '/report', element: withSuspense(<Report />), errorElement: <RouteError /> },
  { path: '/introduce', element: withSuspense(<Introduce />), errorElement: <RouteError /> },
  { path: '/register', element: withSuspense(<Register />), errorElement: <RouteError /> },
  { path: '*', element: <RouteError /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
