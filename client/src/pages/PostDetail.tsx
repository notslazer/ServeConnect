import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Post } from '../lib/types';
import { PostCard } from '../components/PostCard';
import { ErrorState, PageHeader, PageLoader } from '../components/ui';

export default function PostDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['post', id], queryFn: () => api<Post>(`/posts/${id}`) });
  return (
    <div className="mx-auto max-w-[680px]">
      <PageHeader title="Post" back />
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : <PostCard post={q.data!} defaultShowComments onDeleted={() => nav('/feed')} />}
    </div>
  );
}
