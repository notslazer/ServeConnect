import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, FormError, Input, fieldError } from '../../components/ui';
import { OtpInput } from '../../components/OtpInput';
import { AuthFrame, DevCode, PasswordField } from '../../components/AuthKit';

export default function Forgot() {
  const nav = useNavigate();
  const { user, signOut } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState<null | { destination: string; devCode?: string }>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const request = useMutation({
    mutationFn: () => api<{ destination: string; devCode?: string }>('/auth/forgot', { body: { identifier } }),
    onSuccess: setSent,
  });
  const reset = useMutation({
    mutationFn: () => api('/auth/reset', { body: { identifier, code, newPassword: password } }),
    onSuccess: async () => {
      toast.success('Password updated. Sign in with your new password.');
      if (user) await signOut();
      nav('/login', { replace: true });
    },
  });
  return (
    <AuthFrame title="Reset your password" subtitle={sent ? undefined : "Enter the email or phone on your account and we'll send a code."} footer={<Link to="/login" className="link">Back to sign in</Link>}>
      {!sent ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
          <Input label="Email or phone number" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus required autoComplete="username" />
          <FormError error={request.error} />
          <Button type="submit" block size="lg" loading={request.isPending}>Send code</Button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); reset.mutate(); }}>
          <p className="text-[15px] text-ink-soft">If an account exists, we sent a 6-digit code to <b>{sent.destination}</b>.</p>
          <OtpInput value={code} onChange={setCode} />
          <DevCode code={sent.devCode} />
          <PasswordField label="New password" value={password} onChange={setPassword} error={fieldError(reset.error, 'newPassword')} />
          <FormError error={reset.error} />
          <Button type="submit" block size="lg" loading={reset.isPending} disabled={code.length !== 6 || password.length < 8}>Set new password</Button>
          <p className="text-sm text-ink-faint">For your security, this signs you out on every device.</p>
          <button type="button" className="link text-sm" onClick={() => { setSent(null); setCode(''); }}>Didn't get it? Try again</button>
        </form>
      )}
    </AuthFrame>
  );
}
