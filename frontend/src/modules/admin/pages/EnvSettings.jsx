import React, { useState } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    Save,
    Terminal,
    Globe,
    Server,
    Shield,
    Database,
    Cloud,
    CreditCard,
    MessageSquare,
    Eye,
    EyeOff,
    Lock,
    Key,
    AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';

const EnvSettings = () => {
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('frontend');
    const [showSecrets, setShowSecrets] = useState({});

    // Mock initial state
    const [config, setConfig] = useState({
        // Frontend
        VITE_API_BASE_URL: 'http://localhost:5000/api/v1',
        VITE_GOOGLE_MAPS_API_KEY: '',
        VITE_FIREBASE_API_KEY: '',
        VITE_FIREBASE_AUTH_DOMAIN: '',
        VITE_FIREBASE_PROJECT_ID: '',
        VITE_FIREBASE_STORAGE_BUCKET: '',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '',
        VITE_FIREBASE_APP_ID: '',
        VITE_FIREBASE_MEASUREMENT_ID: '',
        VITE_FIREBASE_VAPID_KEY: '',

        // Backend
        FRONTEND_URL: 'http://localhost:5173',
        PORT: 5000,
        JWT_EXPIRES_IN: '7d',
        JWT_REFRESH_EXPIRES_IN: '7d',
        JWT_REFRESH_SECRET: '', // Secret
        JWT_SECRET: '', // Secret

        CLOUDINARY_API_KEY: '',
        CLOUDINARY_API_SECRET: '', // Secret
        CLOUDINARY_CLOUD_NAME: '',

        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '', // Secret

        SMS_INDIA_HUB_USERNAME: '',
        SMS_INDIA_HUB_API_KEY: '', // Secret
        SMS_INDIA_HUB_SENDER_ID: '',
        SMS_INDIA_HUB_DLT_TEMPLATE_ID: '',

        FIREBASE_SERVICE_ACCOUNT: '{}' // JSON
    });

    const toggleSecret = (key) => {
        setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleInputChange = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            showToast('Environment variables updated successfully. Server restart may be required.', 'success');
        }, 1500);
    };

    const InputField = ({ label, name, type = 'text', icon: Icon, isSecret = false, placeholder = '' }) => (
        <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                {label}
                {name && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] lowercase font-mono">{name}</span>}
            </label>
            <div className="relative group">
                {Icon && <Icon className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />}
                <input
                    type={isSecret ? (showSecrets[name] ? 'text' : 'password') : type}
                    value={config[name]}
                    onChange={(e) => handleInputChange(name, e.target.value)}
                    placeholder={placeholder}
                    className={cn(
                        "w-full pr-12 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all font-mono",
                        Icon ? "pl-12" : "pl-5"
                    )}
                />
                {isSecret && (
                    <button
                        onClick={() => toggleSecret(name)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        {showSecrets[name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Environment Controls
                        <div className="p-2 bg-slate-900 rounded-xl">
                            <Terminal className="h-5 w-5 text-white" />
                        </div>
                    </h1>
                    <p className="ds-description mt-1 text-slate-500">
                        Manage critical application secrets and configurations.
                        <span className="text-red-500 font-bold ml-1 flex items-center gap-1 inline-flex">
                            <AlertTriangle className="h-3 w-3" />
                            Handle with care.
                        </span>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-slate-200 active:scale-95",
                            isSaving ? "opacity-70 cursor-wait" : "hover:bg-slate-800"
                        )}
                    >
                        {isSaving ? (
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {isSaving ? 'Deploying...' : 'Save & Deploy'}
                    </button>
                </div>
            </div>

            <div className="flex gap-4 border-b border-slate-100">
                <button
                    onClick={() => setActiveTab('frontend')}
                    className={cn(
                        "pb-4 px-4 text-sm font-bold transition-all border-b-2",
                        activeTab === 'frontend' ? "border-emerald-500 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                >
                    Frontend Configuration
                </button>
                <button
                    onClick={() => setActiveTab('backend')}
                    className={cn(
                        "pb-4 px-4 text-sm font-bold transition-all border-b-2",
                        activeTab === 'backend' ? "border-emerald-500 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                >
                    Backend Configuration
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">

                {/* Frontend Tab */}
                {activeTab === 'frontend' && (
                    <div className="ds-section-spacing animate-in slide-in-from-left-4 duration-500">
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    <Globe className="h-4 w-4 text-slate-400" />
                                    Core Client Config
                                </h3>
                            </div>
                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputField label="API Base URL" name="VITE_API_BASE_URL" icon={Server} placeholder="https://api.yourdomain.com/v1" />
                                <InputField label="Google Maps API Key" name="VITE_GOOGLE_MAPS_API_KEY" icon={Key} isSecret={true} />
                            </div>
                        </Card>

                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    <Cloud className="h-4 w-4 text-amber-500" />
                                    Firebase Client SDK
                                </h3>
                            </div>
                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputField label="API Key" name="VITE_FIREBASE_API_KEY" icon={Key} isSecret={true} />
                                <InputField label="Auth Domain" name="VITE_FIREBASE_AUTH_DOMAIN" icon={Shield} />
                                <InputField label="Project ID" name="VITE_FIREBASE_PROJECT_ID" icon={Database} />
                                <InputField label="Storage Bucket" name="VITE_FIREBASE_STORAGE_BUCKET" icon={Database} />
                                <InputField label="Messaging Sender ID" name="VITE_FIREBASE_MESSAGING_SENDER_ID" icon={MessageSquare} />
                                <InputField label="App ID" name="VITE_FIREBASE_APP_ID" icon={Database} />
                                <InputField label="Measurement ID" name="VITE_FIREBASE_MEASUREMENT_ID" icon={Database} />
                                <div className="md:col-span-2">
                                    <InputField label="VAPID Key (Web Push)" name="VITE_FIREBASE_VAPID_KEY" icon={Key} isSecret={true} />
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Backend Tab */}
                {activeTab === 'backend' && (
                    <div className="ds-section-spacing animate-in slide-in-from-right-4 duration-500">
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    <Server className="h-4 w-4 text-slate-400" />
                                    Server & Security
                                </h3>
                            </div>
                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputField label="Frontend URL (CORS)" name="FRONTEND_URL" icon={Globe} />
                                <InputField label="Server Port" name="PORT" icon={Server} type="number" />
                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <InputField label="JWT Secret" name="JWT_SECRET" icon={Lock} isSecret={true} />
                                    <InputField label="JWT Refresh Secret" name="JWT_REFRESH_SECRET" icon={Lock} isSecret={true} />
                                    <InputField label="Token Expiry" name="JWT_EXPIRES_IN" icon={Terminal} placeholder="7d" />
                                    <InputField label="Refresh Token Expiry" name="JWT_REFRESH_EXPIRES_IN" icon={Terminal} placeholder="7d" />
                                </div>
                            </div>
                        </Card>

                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    <CreditCard className="h-4 w-4 text-purple-500" />
                                    Integrations
                                </h3>
                            </div>
                            <div className="p-4 space-y-8">
                                {/* Cloudinary */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase">Cloudinary (Media)</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <InputField label="Cloud Name" name="CLOUDINARY_CLOUD_NAME" icon={Cloud} />
                                        <InputField label="API Key" name="CLOUDINARY_API_KEY" icon={Key} isSecret={true} />
                                        <InputField label="API Secret" name="CLOUDINARY_API_SECRET" icon={Lock} isSecret={true} />
                                    </div>
                                </div>

                                {/* Razorpay */}
                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase">Razorpay (Payments)</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <InputField label="Key ID" name="RAZORPAY_KEY_ID" icon={Key} />
                                        <InputField label="Key Secret" name="RAZORPAY_KEY_SECRET" icon={Lock} isSecret={true} />
                                    </div>
                                </div>

                                {/* SMS Hub */}
                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase">SMS India Hub</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <InputField label="Username" name="SMS_INDIA_HUB_USERNAME" icon={Terminal} />
                                        <InputField label="Sender ID" name="SMS_INDIA_HUB_SENDER_ID" icon={MessageSquare} />
                                        <InputField label="API Key" name="SMS_INDIA_HUB_API_KEY" icon={Key} isSecret={true} />
                                        <InputField label="DLT Template ID" name="SMS_INDIA_HUB_DLT_TEMPLATE_ID" icon={Terminal} />
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    <Shield className="h-4 w-4 text-red-500" />
                                    Firebase Admin Service Account
                                </h3>
                            </div>
                            <div className="p-4">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        Service Account JSON
                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] lowercase font-mono">FIREBASE_SERVICE_ACCOUNT</span>
                                    </label>
                                    <textarea
                                        rows={8}
                                        value={config.FIREBASE_SERVICE_ACCOUNT}
                                        onChange={(e) => handleInputChange('FIREBASE_SERVICE_ACCOUNT', e.target.value)}
                                        placeholder='{"type": "service_account", ...}'
                                        className="w-full px-5 py-4 bg-slate-900 border-none rounded-2xl text-xs font-mono text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all resize-none"
                                    />
                                    <p className="text-[10px] font-bold text-slate-400 italic">Paste the entire JSON content of your service account key file here.</p>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EnvSettings;
