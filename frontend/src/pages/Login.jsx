import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';
import { UserRole } from '@core/constants/roles';
import Button from '@shared/components/ui/Button';
import Input from '@shared/components/ui/Input';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState(UserRole.CUSTOMER);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = (e) => {
        e.preventDefault();
        // Simulate login for frontend demo
        const userData = {
            id: '1',
            name: `Demo ${role}`,
            email,
            role,
            token: 'demo-token',
        };
        login(userData);
        navigate(`/${role}`);
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-10 shadow-lg">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 leading-9">
                        Quick Commerce
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Sign in to your account
                    </p>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="space-y-4 rounded-md shadow-sm">
                        <Input
                            label="Email address"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="user@example.com"
                        />
                        <Input
                            label="Password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                        <div className="w-full">
                            <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                            <select
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                            >
                                <option value={UserRole.CUSTOMER}>Customer</option>
                                <option value={UserRole.SELLER}>Seller</option>
                                <option value={UserRole.ADMIN}>Admin</option>
                                <option value={UserRole.DELIVERY}>Delivery Partner</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <Button type="submit" className="w-full">
                            Sign In
                        </Button>
                    </div>

                    <div className="text-center">
                        <p className="text-sm text-gray-600">
                            Don't have an account?{' '}
                            <span className="cursor-pointer font-medium text-primary-600 hover:text-primary-500" onClick={() => navigate('/signup')}>
                                Sign up
                            </span>
                        </p>
                        <p className="mt-2 text-sm text-gray-600">
                            Are you a seller?{' '}
                            <span className="cursor-pointer font-medium text-primary-600 hover:text-primary-500" onClick={() => navigate('/seller/auth')}>
                                Join as Partner
                            </span>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
