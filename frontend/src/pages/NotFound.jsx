import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@shared/components/ui/Button';

const NotFound = () => {
    const navigate = useNavigate();

    return (
        <div className="flex h-screen flex-col items-center justify-center bg-gray-50 px-4">
            <h1 className="text-9xl font-bold text-primary-600">404</h1>
            <h2 className="mt-4 text-2xl font-semibold text-gray-900">Page Not Found</h2>
            <p className="mt-2 text-gray-600">The page you're looking for doesn't exist.</p>
            <Button
                className="mt-8"
                onClick={() => navigate('/')}
            >
                Go Back Home
            </Button>
        </div>
    );
};

export default NotFound;
