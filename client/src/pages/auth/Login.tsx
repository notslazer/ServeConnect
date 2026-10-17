import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, FormError, Input } from '../../components/ui';
import { GoogleButton } from '../../components/GoogleButton';
import { OrDivider, AuthFrame, DevCode, GoogleComplete, SessionPayload, TwoFactorStep, VerifyStep } from '../../components/AuthKit';

type Step =
  | { kind: 'password' }
  | { kind: 'otp-request' }
  | { kind: 'otp-verify'; identifier: string; destination: string; channel: 'email' | 'sms'; devCode?: string }
  | { kind: 'unverified'; identifier: string; destination: string; channel: 'email' | 'sms'; devCode?: string }
  | { kind: '2fa'; mfaToken: string }
  | { kind: 'google'; info: { googleToken: string; name: string; email: string } };

export default function Login() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/feed';
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const finish = (d: any) => {
    if (d?.mfaRequired) return setStep({ kind: '2fa', mfaToken: d.mfaToken });
    if (d?.needsProfile) return setStep({ kind: 'google', info: d });
    signIn(d as SessionPayload);
    nav((d as SessionPayload).user.onboardingCompleted ? next : '/onboarding', { replace: true });
  };

  const login = useMutation({
    mutationFn: () => api('/auth/login', { body: { identifier, password } }),
    onSuccess: finish,
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'unverified' && e.data?.verify) {
        setStep({ kind: 'unverified', ...e.data.verify, devCode: e.data.devCode });
      }
    },
  });
  const requestOtp = useMutation({
    mutationFn: () => api<{ destination: string; devCode?: string }>('/auth/otp/request', { body: { identifier } }),
    onSuccess: (d) => setStep({ kind: 'otp-verify', identifier, destination: d.destination, channel: identifier.includes('@') ? 'email' : 'sms', devCode: d.devCode }),
  });
  const google = useMutation({ mutationFn: (credential: string) => api('/auth/google', { body: { credential } }), onSuccess: finish });

  const footer = <>{t('auth.noAccount')} <Link to="/register" className="link font-semibold">{t('auth.signUp')}</Link></>;

  if (step.kind === '2fa') {
    return <AuthFrame title={t('auth.twoFactorTitle')}><TwoFactorStep mfaToken={step.mfaToken} onDone={finish} onCancel={() => setStep({ kind: 'password' })} /></AuthFrame>;
  }
  if (step.kind === 'google') {
    return <AuthFrame title="Finish creating your account"><GoogleComplete info={step.info} onDone={finish} onCancel={() => setStep({ kind: 'password' })} /></AuthFrame>;
  }
  if (step.kind === 'otp-verify' || step.kind === 'unverified') {
    return (
      <AuthFrame title={step.kind === 'unverified' ? 'Verify your account' : 'Enter your code'} subtitle={step.kind === 'unverified' ? 'You need to confirm your email or phone before signing in.' : undefined} footer={footer}>
        <VerifyStep
          identifier={step.identifier}
          destination={step.destination}
          channel={step.channel}
          endpoint={step.kind === 'unverified' ? '/auth/verify' : '/auth/otp/verify'}
          purpose={step.kind === 'unverified' ? (step.channel === 'email' ? 'verify_email' : 'verify_phone') : 'login'}
          devCode={step.devCode}
          onVerified={finish}
          onBack={() => setStep({ kind: step.kind === 'unverified' ? 'password' : 'otp-request' })}
        />
      </AuthFrame>
    );
  }

  const otpMode = step.kind === 'otp-request';
  return (
    <AuthFrame title={t('auth.signInTitle')} subtitle="Sign in to see drives near you and track your hours." footer={footer}>
      <div className="space-y-4">
        <GoogleButton onCredential={(c) => google.mutate(c)} text="signin_with" />
        <FormError error={google.error} />
        <OrDivider />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (otpMode) requestOtp.mutate();
            else login.mutate();
          }}
        >
          <Input
            label={otpMode ? 'Email or phone number' : t('auth.identifier')}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            inputMode={otpMode ? 'email' : undefined}
            autoFocus
            required
          />
          {!otpMode && (
            <div>
              <Input label={t('auth.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              <div className="mt-1.5 text-right"><Link to="/forgot" className="link text-sm">{t('auth.forgot')}</Link></div>
            </div>
          )}
          <FormError error={otpMode ? requestOtp.error : login.error instanceof ApiError && login.error.code === 'unverified' ? null : login.error} />
          {requestOtp.data?.devCode && <DevCode code={requestOtp.data.devCode} />}
          <Button type="submit" block size="lg" loading={login.isPending || requestOtp.isPending}>{otpMode ? t('auth.sendCode') : t('auth.signIn')}</Button>
        </form>
        <Button variant="outline" block onClick={() => setStep({ kind: otpMode ? 'password' : 'otp-request' })}>
          {otpMode ? t('auth.passwordInstead') : t('auth.otpInstead')}
        </Button>
      </div>
    </AuthFrame>
  );
}
