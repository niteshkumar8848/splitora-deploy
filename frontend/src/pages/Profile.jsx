import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { changePassword, updateMe } from '../api';
import Navbar from '../components/Navbar';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 240;
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image processing failed'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Unable to read image file'));
    reader.readAsDataURL(file);
  });
}

function Profile() {
  const { user, setUser } = useAuth();
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', upi_id: '', profile_image_url: '' });
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
      profile_image_url: user.profile_image_url || '',
    });
  }, [user]);

  const onProfileImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file');
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setProfileForm((prev) => ({ ...prev, profile_image_url: dataUrl }));
      toast.success('Profile picture ready to save');
    } catch {
      toast.error('Failed to process image');
    }
  };

  const onProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileLoading(true);
    try {
      const payload = {
        name: profileForm.name,
        phone: profileForm.phone,
        upi_id: profileForm.upi_id || null,
        profile_image_url: profileForm.profile_image_url || null,
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
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                {profileForm.profile_image_url ? (
                  <img src={profileForm.profile_image_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">No Photo</div>
                )}
              </div>
              <div className="space-y-2">
                <input className="input-field" type="file" accept="image/*" onChange={onProfileImageChange} />
                {profileForm.profile_image_url && (
                  <button
                    type="button"
                    className="text-sm text-red-600"
                    onClick={() => setProfileForm((prev) => ({ ...prev, profile_image_url: '' }))}
                  >
                    Remove picture
                  </button>
                )}
              </div>
            </div>
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
