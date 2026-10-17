import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, toastError } from './ui';

export function FollowButton({ userId, following: initial, size = 'sm' }: { userId: string; following: boolean; size?: 'sm' | 'md' }) {
  const [following, setFollowing] = useState(initial);
  const [hover, setHover] = useState(false);
  useEffect(() => setFollowing(initial), [initial]);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api(`/users/${userId}/follow`, { method: following ? 'DELETE' : 'POST' }),
    onMutate: () => setFollowing((f) => !f),
    onError: (e) => { setFollowing((f) => !f); toastError(e); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: ['suggestions'] }); },
  });
  return (
    <Button size={size} variant={following ? (hover ? 'danger' : 'outline') : 'primary'} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={() => m.mutate()} aria-pressed={following}>
      {following ? (hover ? 'Unfollow' : 'Following') : 'Follow'}
    </Button>
  );
}
