import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { changePassword, updateMe } from '../api';
import Navbar from '../components/Navbar';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

function Profile() {
  const { user, setUser } = useAuth();
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', upi_id: '' });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      name: user.name || '',
      phone: user.phone || '',
      upi_id: user.upi_id || '',
    });
  }, [user]);

  const onProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileLoading(true);
    try {
      const payload = {
        name: profileForm.name,
        phone: profileForm.phone,
        upi_id: profileForm.upi_id || null,
      };
      const response = await updateMe(payload);
      setUser(response.data);
      localStorage.setItem('user', JSON.stringify(response.data));
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const onPasswordSubmit = async (event) => {
    event.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('New password and confirm password do not match');
      return;
    }
    setPasswordLoading(true);
    try {
      await changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      toast.success('Password updated successfully');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <section className="section-card">
          <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account details and login credentials.</p>
        </section>

        <section className="section-card">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Profile Details</h2>
          <form onSubmit={onProfileSubmit} className="space-y-4">
            <input
              className="input-field"
              placeholder="Full Name"
              value={profileForm.name}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <input
              className="input-field"
              placeholder="Phone Number"
              value={profileForm.phone}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))}
              required
            />
            <input
              className="input-field"
              placeholder="UPI ID (optional)"
              value={profileForm.upi_id}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, upi_id: event.target.value }))}
            />
            <Button type="submit" disabled={profileLoading}>
              {profileLoading ? 'Saving...' : 'Save Profile'}
            </Button>
          </form>
        </section>

        <section className="section-card">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Change Password</h2>
          <form onSubmit={onPasswordSubmit} className="space-y-4">
            <input
              className="input-field"
              type="password"
              placeholder="Current Password"
              value={passwordForm.current_password}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, current_password: event.target.value }))}
              required
            />
            <input
              className="input-field"
              type="password"
              placeholder="New Password"
              value={passwordForm.new_password}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, new_password: event.target.value }))}
              required
            />
            <input
              className="input-field"
              type="password"
              placeholder="Confirm New Password"
              value={passwordForm.confirm_password}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
              required
            />
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default Profile;
