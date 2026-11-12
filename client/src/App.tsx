import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Workspace from './pages/Workspace';
import Discovery from './pages/Discovery';
import ProductDetail from './pages/ProductDetail';
import Compare from './pages/Compare';
import CartPage from './pages/Cart';
import Approval from './pages/Approval';
import Checkout from './pages/Checkout';
import OrderDetail from './pages/OrderDetail';
import Orders from './pages/Orders';
import Activity from './pages/Activity';
import Settings from './pages/Settings';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Opening your session" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <Shell>{children}</Shell>;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-[520px] py-20 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">404</p>
      <h1 className="mt-3 font-display text-[34px] leading-tight text-ink">That page is not in the ledger</h1>
      <p className="mt-2 text-[13.5px] text-ink-2">Check the address, or start from the workspace.</p>
      <a
        href="/app"
        className="mt-5 inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm text-paper transition-colors hover:bg-night-2"
      >
        Open the workspace
      </a>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<Protected><Workspace /></Protected>} />
        <Route path="/catalog" element={<Protected><Discovery /></Protected>} />
        <Route path="/catalog/:id" element={<Protected><ProductDetail /></Protected>} />
        <Route path="/compare" element={<Protected><Compare /></Protected>} />
        <Route path="/cart" element={<Protected><CartPage /></Protected>} />
        <Route path="/approval/:orderId" element={<Protected><Approval /></Protected>} />
        <Route path="/checkout/:orderId" element={<Protected><Checkout /></Protected>} />
        <Route path="/orders" element={<Protected><Orders /></Protected>} />
        <Route path="/orders/:orderId" element={<Protected><OrderDetail /></Protected>} />
        <Route path="/activity" element={<Protected><Activity /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
