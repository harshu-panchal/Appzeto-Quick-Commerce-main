import React from 'react';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';

const Profile = () => {
    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
            <Card className="p-6">
                <div className="flex items-center space-x-4 mb-6">
                    <div className="h-20 w-20 bg-gray-200 rounded-full flex items-center justify-center text-2xl font-bold text-gray-500">
                        P
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">User Name</h2>
                        <p className="text-gray-500">user@example.com</p>
                        <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase">Active</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h3 className="font-bold text-gray-900 border-b pb-2">Personal Information</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-gray-500">Phone</p>
                                <p className="font-medium">+91 98765 43210</p>
                            </div>
                            <div>
                                <p className="text-gray-500">Role</p>
                                <p className="font-medium capitalize">User</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-bold text-gray-900 border-b pb-2">Actions</h3>
                        <div className="space-y-2">
                            <Button variant="outline" className="w-full justify-start">Change Password</Button>
                            <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50">Logout</Button>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default Profile;
