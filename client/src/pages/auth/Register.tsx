import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, Checkbox, FormError, Input, fieldError } from '../../components/ui';
import { GoogleButton } from '../../components/GoogleButton';
import { OrDivider, AuthFrame, GoogleComplete, PasswordField, ProfileBasics, RolePicker, SessionPayload, VerifyStep, ageFrom } from '../../components/AuthKit';

export default function Register() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialRole = params.get('role');
  const [role, setRole] = useState<'volunteer' | 'organizer' | 'csr'>(initialRole === 'organizer' || initialRole === 'csr' ? initialRole : 'volunteer');
  const [name, setName] = useState('');
  const [usePhone, setUsePhone] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordless, setPasswordless] = useState(false);
  const [dob, setDob] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [orgType, setOrgType] = useState('ngo');
  const [accept, setAccept] = useState(false);
  const [verify, setVerify] = useState<null | { channel: 'email' | 'sms'; identifier: string; destination: string; devCode?: string }>(null);
  const [google, setGoogle] = useState<null | { googleToken: string; name: string; email: string }>(null);

  const finish = (d: any) => {
    if (d?.needsProfile) return setGoogle(d);
    if (d?.mfaRequired) return nav('/login');
    signIn(d as SessionPayload);
    nav((d as SessionPayload).user.onboardingCompleted ? '/feed' : '/onboarding', { replace: true });
  };

  const m = useMutation({
    mutationFn: () =>
      api<{ verify: { channel: 'email' | 'sms'; identifier: string; destination: string }; devCode?: string }>('/auth/register', {
        body: {
          name, role, acceptTerms: accept,
          email: usePhone ? undefined : email,
          phone: usePhone ? phone : undefined,
          password: passwordless ? undefined : password,
          dateOfBirth: role === 'volunteer' ? dob : undefined,
          guardianEmail: guardianEmail || undefined,
          guardianName: guardianName || undefined,
          orgType: role === 'organizer' ? orgType : role === 'csr' ? 'company' : undefined,
        },
      }),
    onSuccess: (d) => setVerify({ ...d.verify, devCode: d.devCode }),
  });
  const googleM = useMutation({ mutationFn: (credential: string) => api('/auth/google', { body: { credential } }), onSuccess: finish });

  if (google) {
    return <AuthFrame title="Finish creating your account"><GoogleComplete info={google} onDone={finish} onCancel={() => setGoogle(null)} /></AuthFrame>;
  }
  if (verify) {
    return (
      <AuthFrame title={verify.channel === 'email' ? 'Check your email' : 'Check your phone'} subtitle="Enter the code to activate your account.">
        <VerifyStep identifier={verify.identifier} destination={verify.destination} channel={verify.channel} endpoint="/auth/verify"
          purpose={verify.channel === 'email' ? 'verify_email' : 'verify_phone'} devCode={verify.devCode} onVerified={finish} onBack={() => setVerify(null)} />
      </AuthFrame>
    );
  }

  const age = ageFrom(dob);
  const blocked = !accept || (role === 'volunteer' && (!dob || (age !== null && age < 13))) || (!passwordless && password.length < 8);
  const generalError = m.error instanceof ApiError && Object.keys(m.error.fields).length ? null : m.error;

  return (
    <AuthFrame title={t('auth.signUpTitle')} subtitle="Free for volunteers, NGOs and companies." footer={<>{t('auth.haveAccount')} <Link to="/login" className="link font-semibold">{t('auth.signIn')}</Link></>}>
      <div className="space-y-4">
        <RolePicker value={role} onChange={setRole} />
        <GoogleButton onCredential={(c) => googleM.mutate(c)} text="signup_with" />
        <FormError error={googleM.error} />
        <OrDivider />
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }} noValidate>
          <Input label={role === 'volunteer' ? 'Full name' : role === 'csr' ? 'Company name' : 'Organization or your name'} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required error={fieldError(m.error, 'name')} />
          {usePhone ? (
            <Input label="Mobile number" type="tel" inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required error={fieldError(m.error, 'phone')} hint="We'll text you a code. Indian numbers can skip +91." />
          ) : (
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required error={fieldError(m.error, 'email')} />
          )}
          <button type="button" className="link -mt-2 text-sm" onClick={() => setUsePhone((v) => !v)}>{usePhone ? 'Use email instead' : 'Use a phone number instead'}</button>
          {!passwordless && <PasswordField value={password} onChange={setPassword} error={fieldError(m.error, 'password')} />}
          <Checkbox checked={passwordless} onChange={setPasswordless} label="Skip the password — I'll sign in with one-time codes" />
          <ProfileBasics hideRole {...{ role, setRole, dob, setDob, guardianEmail, setGuardianEmail, guardianName, setGuardianName, orgType, setOrgType, accept, setAccept }} error={m.error} />
          <FormError error={generalError} />
          <Button type="submit" block size="lg" loading={m.isPending} disabled={blocked}>{t('auth.signUp')}</Button>
        </form>
      </div>
    </AuthFrame>
  );
}
