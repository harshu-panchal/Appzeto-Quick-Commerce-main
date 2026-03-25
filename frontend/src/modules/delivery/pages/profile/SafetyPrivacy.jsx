import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus, Phone, Trash2, Shield, Lock, Eye } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import { useSettings } from "@/core/context/SettingsContext";

const SafetyPrivacy = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";

  const [contacts, setContacts] = useState([
    { id: 1, name: "Anita Kumar (Wife)", phone: "+91 98765 12345" },
    { id: 2, name: "Ravi Singh (Brother)", phone: "+91 98765 67890" },
  ]);

  const [newContact, setNewContact] = useState({ name: "", phone: "" });
  const [showAddContact, setShowAddContact] = useState(false);

  const handleAddContact = () => {
    if (newContact.name && newContact.phone) {
      setContacts([...contacts, { ...newContact, id: Date.now() }]);
      setNewContact({ name: "", phone: "" });
      setShowAddContact(false);
      toast.success("Emergency contact added!");
    }
  };

  const handleRemoveContact = (id) => {
    setContacts(contacts.filter((c) => c.id !== id));
    toast.success("Contact removed");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Safety & Privacy</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Emergency Contacts */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
            <Shield size={20} className="mr-2 text-primary" /> Emergency Contacts
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            These contacts will be notified if you trigger the SOS alert during a delivery.
          </p>

          <div className="space-y-3">
            {contacts.map((contact) => (
              <Card key={contact.id} className="p-4 flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-gray-800">{contact.name}</h4>
                  <p className="text-sm text-gray-500 flex items-center mt-1">
                    <Phone size={14} className="mr-1" /> {contact.phone}
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-red-500 hover:bg-red-50"
                  onClick={() => handleRemoveContact(contact.id)}
                >
                  <Trash2 size={18} />
                </Button>
              </Card>
            ))}

            {showAddContact ? (
              <Card className="p-4 border-dashed border-2 border-gray-200 bg-gray-50">
                <Input 
                  placeholder="Name (e.g. Wife, Brother)" 
                  value={newContact.name}
                  onChange={(e) => setNewContact({...newContact, name: e.target.value})}
                  className="mb-3 bg-white"
                />
                <Input 
                  placeholder="Phone Number" 
                  value={newContact.phone}
                  onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
                  className="mb-3 bg-white"
                />
                <div className="flex space-x-2">
                  <Button size="sm" onClick={handleAddContact} className="flex-1">Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddContact(false)} className="flex-1">Cancel</Button>
                </div>
              </Card>
            ) : (
              <Button 
                variant="outline" 
                className="w-full border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary"
                onClick={() => setShowAddContact(true)}
              >
                <UserPlus size={18} className="mr-2" /> Add New Contact
              </Button>
            )}
          </div>
        </section>

        {/* Privacy Settings */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
            <Lock size={20} className="mr-2 text-primary" /> Privacy Settings
          </h2>
          <Card className="divide-y divide-gray-100">
            <div className="p-4 flex justify-between items-center">
              <div>
                <h4 className="font-medium text-gray-800">Share Live Location</h4>
                <p className="text-xs text-gray-500">Allow customers to track you during delivery</p>
              </div>
              <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full bg-green-500 cursor-pointer">
                <span className="absolute left-6 top-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ease-in-out transform"></span>
              </div>
            </div>
            <div className="p-4 flex justify-between items-center">
              <div>
                <h4 className="font-medium text-gray-800">Profile Visibility</h4>
                <p className="text-xs text-gray-500">Show your photo to customers</p>
              </div>
              <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full bg-green-500 cursor-pointer">
                <span className="absolute left-6 top-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ease-in-out transform"></span>
              </div>
            </div>
          </Card>
        </section>

        <div className="bg-blue-50 p-4 rounded-xl flex items-start">
          <Eye size={20} className="text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            {appName} values your privacy. Your location is only shared while you are on an active delivery.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SafetyPrivacy;
