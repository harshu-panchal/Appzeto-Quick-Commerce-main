import { Suspense } from 'react';
import AppRouter from '@core/routes/AppRouter';
import { AuthProvider } from '@core/context/AuthContext';
import { SettingsProvider } from '@core/context/SettingsContext';
import { SupportUnreadProvider } from '@core/context/SupportUnreadContext';
import SeoHead from '@core/components/SeoHead';
import { ToastProvider } from './shared/components/ui/Toast';
import Loader from './shared/components/ui/Loader';
import ErrorBoundary from './shared/components/ErrorBoundary';
import LenisScroll from './shared/components/LenisScroll';

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <SettingsProvider>
                    <SeoHead />
                    <ToastProvider>
                        <Suspense fallback={<Loader fullScreen />}>
                            <SupportUnreadProvider>
                                <LenisScroll />
                                <AppRouter />
                            </SupportUnreadProvider>
                        </Suspense>
                    </ToastProvider>
                </SettingsProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
