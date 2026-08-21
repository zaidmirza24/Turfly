import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch, apiPost, apiDelete, clearStoredSession } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ImageUploader } from '@/components/ImageUploader';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { resolveImageUrl } from '@/lib/imageUrl';
import { User } from '@/types';

export default function AccountSettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [avatarDraft, setAvatarDraft] = useState<string[]>(user?.avatar ? [user.avatar] : []);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  const profileMutation = useMutation({
    mutationFn: () => apiPatch<User>('/users/me', { name, phone, avatar: avatarDraft[0] ?? null }),
    onSuccess: (res) => {
      toast.success('Profile updated');
      localStorage.setItem('user', JSON.stringify({ ...user, ...res.data }));
      // AuthContext only reads localStorage on mount — a full reload is the
      // simplest way to make the navbar/avatar reflect the change everywhere
      // without threading a setUser through every consumer of useAuth.
      window.location.reload();
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update profile'),
  });

  const passwordMutation = useMutation({
    mutationFn: () => apiPost('/users/me/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to change password'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete('/users/me', { data: { password: deletePassword } }),
    onSuccess: () => {
      toast.success('Account deleted');
      clearStoredSession();
      queryClient.clear();
      navigate('/');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to delete account'),
  });

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-10 max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your profile, security, and account.</p>
      </div>

      <section className="border rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarDraft[0] ? resolveImageUrl(avatarDraft[0]) : undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
              {user.name?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <ImageUploader value={avatarDraft} onChange={(urls) => setAvatarDraft(urls.slice(-1))} max={1} disabled={profileMutation.isPending} />
          </div>
        </div>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user.email} disabled />
          <p className="text-[11px] text-muted-foreground mt-1">Email can't be changed — contact support if you need to update it.</p>
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" />
        </div>
        <Button onClick={() => profileMutation.mutate()} disabled={profileMutation.isPending}>
          {profileMutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
          Save Profile
        </Button>
      </section>

      <section className="border rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold">Change Password</h2>
        <div>
          <Label htmlFor="current-password">Current Password</Label>
          <Input id="current-password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="new-password">New Password</Label>
          <Input id="new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
        </div>
        <Button
          variant="outline"
          onClick={() => passwordMutation.mutate()}
          disabled={passwordMutation.isPending || !currentPassword || newPassword.length < 6}
        >
          {passwordMutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
          Change Password
        </Button>
      </section>

      {user.role === 'USER' && (
        <section className="border border-destructive/30 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-destructive flex items-center gap-2"><ShieldAlert size={18} /> Danger Zone</h2>
          <p className="text-sm text-muted-foreground">
            Deleting your account is permanent. You'll need to cancel any upcoming bookings first.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2"><Trash2 size={14} /> Delete Account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This can't be undone. Confirm your password to continue.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                type="password"
                placeholder="Password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeletePassword('')}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={!deletePassword || deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  {deleteMutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                  Delete Permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      )}
    </div>
  );
}
